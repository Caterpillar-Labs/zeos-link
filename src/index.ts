import {
  DEFAULT_ZEOS_LINK_URL,
  type ZeosLinkBalanceFilter,
  type ZeosLinkBalancesResult,
  type ZeosLinkChainParams,
  type ZeosLinkLoginResult,
  type ZeosLinkRequestFrame,
  type ZeosLinkRequestOptions,
  type ZeosLinkTransactResult,
  type ZeosLinkWebSocket,
  type ZeosLinkWebSocketConstructor,
  type ZeosLinkWsFrame,
  type ZeosLinkZAction,
  type ZSessionOptions,
} from "./types";
import { ZeosLinkConnectionError, ZeosLinkProtocolError, ZeosLinkSendError, ZeosLinkTimeoutError } from "./errors";

export * from "./types";
export * from "./errors";

type PendingEntry = {
  request: string;
  resolveProtocolError: boolean;
  resolve: (value: ZeosLinkWsFrame) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type InternalSendOptions = ZeosLinkRequestOptions & {
  resolveProtocolError?: boolean;
};

function getDefaultWebSocketConstructor(): ZeosLinkWebSocketConstructor {
  const WebSocketCtor = globalThis.WebSocket as unknown as ZeosLinkWebSocketConstructor | undefined;
  if (!WebSocketCtor) {
    throw new ZeosLinkConnectionError("WebSocket is not available in this runtime");
  }
  return WebSocketCtor;
}

function normalizeProtocolError(request: string, frame: ZeosLinkWsFrame): ZeosLinkProtocolError {
  return new ZeosLinkProtocolError(frame.error || `${request} failed`, frame);
}

function normalizeErrorFrame(request: string, frame: ZeosLinkWsFrame): ZeosLinkWsFrame {
  return {
    ...frame,
    status: "error",
    error: frame.error || `${request} failed`,
    detail: frame.detail ?? frame,
  };
}

/**
 * Browser SDK client for the local ZEOS Link WebSocket service.
 *
 * ZSession is deliberately small: it opens a WebSocket, sends request frames with ids,
 * matches response frames, tracks the logged-in chain/handle, and exposes the ZEOS Link
 * protocol calls used by browser apps.
 */
export class ZSession {
  public readonly url: string;

  private ws: ZeosLinkWebSocket | null;
  private readonly WebSocketCtor: ZeosLinkWebSocketConstructor;
  private opening: Promise<void> | null;
  private nextId: number;
  private pending: Map<number, PendingEntry>;
  private chain: ZeosLinkChainParams | null;
  private actor: string | null;
  private onCloseExternal: () => void;
  private isTransacting: boolean;
  private lastTransactRequestId: number | null;

  constructor(url: string = DEFAULT_ZEOS_LINK_URL, options: ZSessionOptions = {}) {
    this.url = url;
    this.WebSocketCtor = options.WebSocket ?? getDefaultWebSocketConstructor();
    this.ws = null;
    this.opening = null;
    this.nextId = 1;
    this.pending = new Map();
    this.chain = null;
    this.actor = null;
    this.onCloseExternal = () => {};
    this.isTransacting = false;
    this.lastTransactRequestId = null;
  }

  isConnected(): boolean {
    return this.isOpen();
  }

  handle(): string | null {
    return this.actor;
  }

  async login(chain: ZeosLinkChainParams, closeCallback: () => void = () => {}): Promise<ZeosLinkLoginResult | null> {
    this.validateChainParams(chain);
    await this.ensureOpen(closeCallback);

    const res = await this.send("login", chain, {
      timeoutMs: 30_000,
      resolveProtocolError: true,
    });

    if (res.status === "error" || res.error === "login declined") {
      this.chain = null;
      this.actor = null;
      return null;
    }

    this.chain = chain;
    this.actor = typeof res.result === "string" ? res.result : null;
    return res as ZeosLinkLoginResult;
  }

  logout(): void {
    this.actor = null;
    this.chain = null;
    this.lastTransactRequestId = null;
    this.opening = null;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Nothing useful to do here. logout() is best-effort cleanup.
      }
      this.ws = null;
    }

    this.rejectAllPending(new ZeosLinkConnectionError("Logged out"));
  }

  async allBalances(
    ft: boolean = true,
    nft: boolean = true,
    at: boolean = true,
    opts: ZeosLinkRequestOptions = {},
  ): Promise<ZeosLinkBalancesResult> {
    await this.ensureOpen(this.onCloseExternal);
    const res = await this.send("all_balances", { ft, nft, at }, { timeoutMs: opts.timeoutMs ?? 15_000 });
    return (res.result ?? {}) as ZeosLinkBalancesResult;
  }

  async balances(
    ftSymbols?: string[],
    nftContract?: ZeosLinkBalanceFilter,
    atContract?: ZeosLinkBalanceFilter,
    opts: ZeosLinkRequestOptions = {},
  ): Promise<ZeosLinkBalancesResult> {
    this.validateBalancesParams(ftSymbols, nftContract, atContract);
    await this.ensureOpen(this.onCloseExternal);
    const res = await this.send(
      "balances",
      {
        ft_symbols: ftSymbols,
        nft_contract: nftContract,
        at_contract: atContract,
      },
      { timeoutMs: opts.timeoutMs ?? 15_000 },
    );
    return (res.result ?? {}) as ZeosLinkBalancesResult;
  }

  async transact(
    zactions: ZeosLinkZAction[],
    addFee: boolean = true,
    publishFeeNote: boolean = true,
    opts: ZeosLinkRequestOptions = {},
  ): Promise<ZeosLinkTransactResult> {
    if (!this.chain) throw new ZeosLinkProtocolError("Not logged in");
    if (!Array.isArray(zactions)) throw new TypeError("transact() expects an array of ZEOS Link zactions");

    this.isTransacting = true;
    try {
      await this.ensureOpen(this.onCloseExternal);
      const res = await this.send(
        "transact",
        {
          chain_id: this.chain.chain_id,
          protocol_contract: this.chain.protocol_contract,
          vault_contract: this.chain.vault_contract,
          alias_authority: this.chain.alias_authority,
          add_fee: addFee,
          publish_fee_note: publishFeeNote,
          zactions,
        },
        {
          timeoutMs: opts.timeoutMs ?? 60_000,
          resolveProtocolError: true,
        },
      );
      return res as ZeosLinkTransactResult;
    } finally {
      this.isTransacting = false;
    }
  }

  private isOpen(): boolean {
    return !!this.ws && this.ws.readyState === this.WebSocketCtor.OPEN;
  }

  private async ensureOpen(closeCallback: () => void = () => {}): Promise<void> {
    if (this.isOpen()) return;
    if (this.opening) return this.opening;

    this.onCloseExternal = closeCallback;
    const ws = new this.WebSocketCtor(this.url);
    this.ws = ws;

    this.opening = new Promise<void>((resolve, reject) => {
      let opened = false;
      let settled = false;

      const rejectOpening = (error: Error) => {
        if (settled) return;
        settled = true;
        this.opening = null;
        if (this.ws === ws) this.ws = null;
        reject(error);
      };

      const resolveOpening = () => {
        if (settled) return;
        opened = true;
        settled = true;
        this.opening = null;
        resolve();
      };

      ws.onopen = () => {
        resolveOpening();
      };

      ws.onmessage = (evt) => {
        this.handleMessage(evt.data);
      };

      ws.onerror = () => {
        const error = new ZeosLinkConnectionError("WebSocket error");
        if (!opened) rejectOpening(error);
        this.rejectAllPending(error);
      };

      ws.onclose = () => {
        const error = new ZeosLinkConnectionError(opened ? "WebSocket closed" : "Socket closed during connect");
        if (!opened) {
          rejectOpening(error);
        } else {
          this.rejectAllPending(error);
          this.ws = null;
          this.lastTransactRequestId = null;
          if (!this.isTransacting) {
            try {
              this.onCloseExternal();
            } catch {
              // App callbacks must not break socket cleanup.
            }
          }
        }
      };
    });

    return this.opening;
  }

  private send(request: string, params: unknown, { timeoutMs = 15_000, resolveProtocolError = false }: InternalSendOptions = {}): Promise<ZeosLinkWsFrame> {
    if (!this.isOpen()) return Promise.reject(new ZeosLinkConnectionError("Socket not open"));

    const id = this.nextId++;
    const frame: ZeosLinkRequestFrame = { id, request, params };
    const payload = JSON.stringify(frame);

    return new Promise<ZeosLinkWsFrame>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        if (this.lastTransactRequestId === id) this.lastTransactRequestId = null;
        reject(new ZeosLinkTimeoutError(request, timeoutMs));
      }, timeoutMs);

      this.pending.set(id, {
        request,
        resolveProtocolError,
        resolve,
        reject,
        timeout,
      });

      if (request === "transact") this.lastTransactRequestId = id;

      try {
        this.ws!.send(payload);
      } catch (err) {
        clearTimeout(timeout);
        this.pending.delete(id);
        if (this.lastTransactRequestId === id) this.lastTransactRequestId = null;
        reject(new ZeosLinkSendError(err));
      }
    });
  }

  private handleMessage(raw: string): void {
    let msg: ZeosLinkWsFrame;
    try {
      msg = JSON.parse(raw) as ZeosLinkWsFrame;
    } catch {
      return;
    }

    const id = msg.id;
    if (typeof id !== "number" || !this.pending.has(id)) {
      this.handleUncorrelatedMessage(msg);
      return;
    }

    const pending = this.pending.get(id)!;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (this.lastTransactRequestId === id) this.lastTransactRequestId = null;

    if (msg.status === "success") {
      pending.resolve(msg);
      return;
    }

    if (pending.resolveProtocolError) {
      pending.resolve(normalizeErrorFrame(pending.request, msg));
      return;
    }

    pending.reject(normalizeProtocolError(pending.request, msg));
  }

  private handleUncorrelatedMessage(msg: ZeosLinkWsFrame): void {
    if (typeof msg.id !== "number" && msg.status === "error" && this.pending.size === 1) {
      const first = this.pending.entries().next().value;
      if (!first) return;
      const [pendingId, pending] = first;
      clearTimeout(pending.timeout);
      this.pending.delete(pendingId);
      if (this.lastTransactRequestId === pendingId) this.lastTransactRequestId = null;

      if (pending.resolveProtocolError) {
        pending.resolve(normalizeErrorFrame(pending.request, msg));
      } else {
        pending.reject(normalizeProtocolError(pending.request, msg));
      }
      return;
    }

    if (this.isTransacting && msg.status === "error" && this.lastTransactRequestId !== null) {
      const pending = this.pending.get(this.lastTransactRequestId);
      if (!pending || pending.request !== "transact") return;

      clearTimeout(pending.timeout);
      this.pending.delete(this.lastTransactRequestId);
      this.lastTransactRequestId = null;
      pending.resolve(normalizeErrorFrame("transact", msg));
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    this.lastTransactRequestId = null;
  }

  private validateChainParams(chain: ZeosLinkChainParams): void {
    if (!chain || typeof chain !== "object") throw new TypeError("login() expects chain parameters");
    if (typeof chain.chain_id !== "string" || chain.chain_id.length === 0) throw new TypeError("chain.chain_id is required");
    if (typeof chain.protocol_contract !== "string" || chain.protocol_contract.length === 0) throw new TypeError("chain.protocol_contract is required");
    if (typeof chain.vault_contract !== "string" || chain.vault_contract.length === 0) throw new TypeError("chain.vault_contract is required");
    if (typeof chain.alias_authority !== "string" || chain.alias_authority.length === 0) throw new TypeError("chain.alias_authority is required");
  }

  private validateBalancesParams(
    ftSymbols?: string[],
    nftContract?: ZeosLinkBalanceFilter,
    atContract?: ZeosLinkBalanceFilter,
  ): void {
    if (ftSymbols !== undefined && (!Array.isArray(ftSymbols) || ftSymbols.some((sym) => typeof sym !== "string"))) {
      throw new TypeError("balances() ftSymbols must be an array of strings");
    }
    if (nftContract !== undefined && typeof nftContract !== "string") {
      throw new TypeError("balances() nftContract must be a string");
    }
    if (atContract !== undefined && typeof atContract !== "string") {
      throw new TypeError("balances() atContract must be a string");
    }
  }
}

export default ZSession;
