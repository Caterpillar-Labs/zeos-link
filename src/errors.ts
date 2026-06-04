import type { WsFrame } from "./types";

export class ZError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConnectionError extends ZError {}

export class TimeoutError extends ZError {
  readonly request: string;
  readonly timeoutMs: number;

  constructor(request: string, timeoutMs: number) {
    super(`Timeout waiting for ${request}`);
    this.request = request;
    this.timeoutMs = timeoutMs;
  }
}

export class ProtocolError extends ZError {
  readonly frame: WsFrame | undefined;

  constructor(message: string, frame?: WsFrame) {
    super(message);
    this.frame = frame;
  }
}

export class SendError extends ZError {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.cause = cause;
  }
}
