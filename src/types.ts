/**
 * Public SDK types for zeos-link.
 *
 * These types intentionally describe the ZEOS Link browser/WebSocket protocol only.
 * They do not depend on React, WharfKit, Anchor, EOSIO libraries, or any app-specific
 * wallet/session abstractions.
 */

export const DEFAULT_ZEOS_LINK_URL = "wss://127.0.0.1:9367" as const;

export type ZeosLinkStatus = "success" | "error" | string;

export type ZeosLinkJsonPrimitive = string | number | boolean | null;
export type ZeosLinkJsonValue =
  | ZeosLinkJsonPrimitive
  | ZeosLinkJsonValue[]
  | { [key: string]: ZeosLinkJsonValue | undefined };

/** Chain parameters required by the ZEOS Link login/transact protocol. */
export interface ZeosLinkChainParams {
  chain_id: string;
  protocol_contract: string;
  vault_contract: string;
  alias_authority: string;
}

/** ZEOS/CLOAK private action payload. */
export interface ZeosLinkZAction {
  name: string;
  data: Record<string, unknown>;
}

export interface ZeosLinkRequestOptions {
  timeoutMs?: number;
}

export interface ZSessionOptions {
  /**
   * Optional WebSocket constructor override.
   * Useful for tests or non-browser runtimes that provide a compatible WebSocket implementation.
   */
  WebSocket?: ZeosLinkWebSocketConstructor;
}

export interface ZeosLinkLoginResult {
  id?: number;
  status: ZeosLinkStatus;
  result?: unknown;
  error?: string;
  detail?: unknown;
}

export interface ZeosLinkAuthTokenBundle {
  spent: string[];
  unspent: string[];
}

export interface ZeosLinkBalancesResult {
  fts?: string[];
  nfts?: unknown[] | string[];
  ats?: ZeosLinkAuthTokenBundle | string[];
  [key: string]: unknown;
}

export type ZeosLinkBalanceFilter = string;

export interface ZeosLinkTransactResult {
  id?: number;
  status: ZeosLinkStatus;
  result?: unknown;
  response?: unknown;
  error?: string;
  detail?: unknown;
  payload?: unknown;
  [key: string]: unknown;
}

export interface ZeosLinkRequestFrame {
  id: number;
  request: string;
  params: unknown;
}

export interface ZeosLinkWsFrame {
  id?: number;
  status?: ZeosLinkStatus;
  result?: unknown;
  error?: string;
  detail?: unknown;
  payload?: unknown;
  response?: unknown;
  [key: string]: unknown;
}

export interface ZeosLinkMessageEvent {
  data: string;
}

export interface ZeosLinkWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: ZeosLinkMessageEvent) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export interface ZeosLinkWebSocketConstructor {
  readonly OPEN: number;
  readonly CONNECTING: number;
  readonly CLOSING: number;
  readonly CLOSED: number;
  new (url: string): ZeosLinkWebSocket;
}
