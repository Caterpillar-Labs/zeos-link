import type { ZeosLinkMessageEvent, ZeosLinkWebSocket } from "../src/types";

export class MockWebSocket implements ZeosLinkWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  failSend = false;

  onopen: (() => void) | null = null;
  onmessage: ((event: ZeosLinkMessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static latest(): MockWebSocket {
    const ws = MockWebSocket.instances.at(-1);
    if (!ws) throw new Error("No MockWebSocket instance created");
    return ws;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  receiveRaw(data: string): void {
    this.onmessage?.({ data });
  }

  send(data: string): void {
    if (this.failSend) throw new Error("send failed");
    this.sent.push(data);
  }

  error(): void {
    this.onerror?.();
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export function lastSentId(ws: MockWebSocket): number {
  const raw = ws.sent.at(-1);
  if (!raw) throw new Error("No sent frame");
  const frame = JSON.parse(raw) as { id: number };
  return frame.id;
}
