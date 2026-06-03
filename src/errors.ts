import type { ZeosLinkWsFrame } from "./types";

export class ZeosLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ZeosLinkConnectionError extends ZeosLinkError {}

export class ZeosLinkTimeoutError extends ZeosLinkError {
  readonly request: string;
  readonly timeoutMs: number;

  constructor(request: string, timeoutMs: number) {
    super(`Timeout waiting for ${request}`);
    this.request = request;
    this.timeoutMs = timeoutMs;
  }
}

export class ZeosLinkProtocolError extends ZeosLinkError {
  readonly frame?: ZeosLinkWsFrame;

  constructor(message: string, frame?: ZeosLinkWsFrame) {
    super(message);
    this.frame = frame;
  }
}

export class ZeosLinkSendError extends ZeosLinkError {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.cause = cause;
  }
}
