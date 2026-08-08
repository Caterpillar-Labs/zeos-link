/**
 * Public SDK types for zeos-link.
 *
 * These types intentionally describe the CLOAK / ZEOS Link browser-WebSocket
 * protocol only. They do not depend on React, WharfKit, Anchor, EOSIO libraries,
 * or app-specific wallet/session abstractions.
 */

export const DEFAULT_URL = "wss://127.0.0.1:9367" as const;

export type Status = "success" | "error" | string;

/** Chain parameters required by the ZEOS Link login/transact protocol. */
export interface ChainParams {
  chain_id: string;
  protocol_contract: string;
  vault_contract: string;
  alias_authority: string;
}

export interface RequestOptions {
  timeoutMs?: number;
}

export interface SessionOptions {
  /**
   * Optional WebSocket constructor override.
   * Useful for tests or non-browser runtimes that provide a compatible WebSocket implementation.
   */
  WebSocket?: WebSocketConstructorLike;
}

export interface LoginResult {
  id?: number;
  status: Status;
  result?: unknown;
  error?: string;
  detail?: unknown;
}

export interface AuthTokenBundle {
  spent: string[];
  unspent: string[];
}

/**
 * Wallet contract filter for `all_balances` NFT / auth-token queries.
 * Maps to contract id `0` in the desktop wallet (all contracts).
 */
export const ALL_WALLET_CONTRACTS = "";

/** Parameters for the wallet `all_balances` WebSocket request. */
export interface AllBalancesParams {
  /** When true (default), include fungible token balances (`fts`). */
  ft?: boolean;
  /** NFT contract filter. Omit to skip NFTs. Use {@link ALL_WALLET_CONTRACTS} for all NFTs. */
  nftContract?: string;
  /** Auth-token contract filter. Omit to skip auth tokens. Use {@link ALL_WALLET_CONTRACTS} for all auth tokens. */
  atContract?: string;
}

export interface BalancesResult {
  fts?: string[];
  nfts?: unknown[] | string[];
  ats?: AuthTokenBundle | string[];
  [key: string]: unknown;
}

/** Successful wallet-side metadata merged into a `transact` response payload. */
export interface TransactPayload {
  /** Auth-token metadata produced while signing the private transaction. */
  auth_tokens?: AuthTokenBundle;
  /**
   * Exact private-transaction fee resolved and paid by the wallet.
   *
   * Canonical ExtendedAsset string, for example `0.0123 CLOAK@thezeostoken`.
   * Present only when a compatible wallet reports a confirmed successful fee.
   */
  tx_fee?: string;
  [key: string]: unknown;
}

export interface TransactResult {
  id?: number;
  status: Status;
  result?: unknown;
  response?: unknown;
  error?: string;
  detail?: unknown;
  payload?: TransactPayload;
  [key: string]: unknown;
}

/**
 * A high-level CLOAK/ZEOS private action.
 *
 * These are developer-facing actions. For authenticate.actions[].data, pass normal
 * unpacked EOSIO JSON action data. The CLOAK wallet packs it to ABI hex internally.
 */
export type ZAction =
  | MintAction
  | SpendAction
  | AuthenticateAction
  | PublishNotesAction
  | WithdrawAction;

export interface MintAction {
  name: "mint";
  data: {
    /** "$SELF" or a shielded address. */
    to: string;
    /** Token/NFT/auth-token contract account. */
    contract: string;
    /** FT: "10.0000 EOS"; NFT: "123456789"; auth token mint: "0". */
    quantity: string;
    memo: string;
    /** EOSIO sender account that funded the protocol asset buffer. */
    from: string;
    publish_note: boolean;
  };
}

export interface SpendAction {
  name: "spend";
  data: {
    /** Token or NFT contract account. */
    contract: string;
    /** "$SELF" or shielded address for change. */
    change_to: string;
    publish_change_note: boolean;
    to: Array<{
      /** "$SELF", shielded address, EOSIO account, or 64-char auth/vault recipient hash. */
      to: string;
      /** FT: "10.0000 EOS"; NFT: "123456789". */
      quantity: string;
      memo: string;
      publish_note: boolean;
    }>;
  };
}

export interface AuthenticateAction {
  name: "authenticate";
  data: {
    /** "$AUTH0".."$AUTH9" from same transaction, or 64-char auth-token commitment hex. */
    auth_token: string;
    /** Whether the auth token should be burned/consumed. */
    burn: boolean;
    /**
     * EOSIO actions authorized privately by the auth token.
     *
     * data is normal unpacked EOSIO JSON action data, exactly like native EOSIO wallets accept.
     * The CLOAK wallet packs this data using the chain ABI before Rust transaction resolution.
     */
    actions: Array<{
      account: string;
      name: string;
      authorization: string[];
      data: Record<string, unknown>;
    }>;
  };
}

export interface PublishNotesAction {
  name: "publishnotes";
  data: {
    notes: string[];
  };
}

export interface WithdrawAction {
  name: "withdraw";
  data: {
    /** Token or NFT contract account. */
    contract: string;
    /** FT: "10.0000 EOS"; NFT: "123456789". */
    quantity: string;
    memo: string;
    /** Unshielded EOSIO recipient account. */
    to: string;
  };
}

export interface RequestFrame {
  id: number;
  request: string;
  params: unknown;
}

export interface WsFrame {
  id?: number;
  status?: Status;
  result?: unknown;
  error?: string;
  detail?: unknown;
  payload?: unknown;
  response?: unknown;
  [key: string]: unknown;
}

export interface MessageEventLike {
  data: string;
}

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: MessageEventLike) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export interface WebSocketConstructorLike {
  readonly OPEN: number;
  readonly CONNECTING: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
  new (url: string): WebSocketLike;
}
