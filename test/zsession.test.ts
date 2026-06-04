import { beforeEach, describe, expect, it, vi } from "vitest";
import ZSession, { ConnectionError, ProtocolError, TimeoutError, type ChainParams, type ZAction } from "../src";
import { flushMicrotasks, lastSentId, MockWebSocket } from "./mock-websocket";

const chain: ChainParams = {
  chain_id: "chain-id",
  protocol_contract: "zeosprot1111",
  vault_contract: "zeosvault111",
  alias_authority: "aliasauth111",
};

const mintAction: ZAction = {
  name: "mint",
  data: {
    to: "$SELF",
    contract: "eosio.token",
    quantity: "1.0000 EOS",
    memo: "",
    from: "alice",
    publish_note: true,
  },
};

const spendAction: ZAction = {
  name: "spend",
  data: {
    contract: "eosio.token",
    change_to: "$SELF",
    publish_change_note: true,
    to: [
      {
        to: "bob",
        quantity: "1.0000 EOS",
        memo: "",
        publish_note: true,
      },
    ],
  },
};

const authenticateAction: ZAction = {
  name: "authenticate",
  data: {
    auth_token: "$AUTH0",
    burn: true,
    actions: [
      {
        account: "claimcontract",
        name: "claimauctiop",
        authorization: ["claimcontract@active"],
        data: { round: 7 },
      },
    ],
  },
};

async function login(session: ZSession): Promise<MockWebSocket> {
  const promise = session.login(chain);
  const ws = MockWebSocket.latest();
  ws.open();
  await flushMicrotasks();
  ws.receive({ id: lastSentId(ws), status: "success", result: "private.actor" });
  await expect(promise).resolves.toMatchObject({ status: "success", result: "private.actor" });
  return ws;
}

describe("ZSession", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.useRealTimers();
  });

  it("logs in successfully and stores the handle", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const promise = session.login(chain);
    const ws = MockWebSocket.latest();

    ws.open();
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "success", result: "private.actor" });

    await expect(promise).resolves.toMatchObject({ status: "success", result: "private.actor" });
    expect(session.isConnected()).toBe(true);
    expect(session.handle()).toBe("private.actor");
  });

  it("returns null when login is declined", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const promise = session.login(chain);
    const ws = MockWebSocket.latest();

    ws.open();
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "error", error: "login declined" });

    await expect(promise).resolves.toBeNull();
    expect(session.handle()).toBeNull();
  });

  it("returns all balance results", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.allBalances(true, false, true);
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "success", result: { fts: ["1.0000 EOS"], ats: { unspent: [], spent: [] } } });

    await expect(promise).resolves.toEqual({ fts: ["1.0000 EOS"], ats: { unspent: [], spent: [] } });
  });

  it("throws on balance protocol error", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.allBalances();
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "error", error: "balance failed" });

    await expect(promise).rejects.toBeInstanceOf(ProtocolError);
  });

  it("routes id-less server error frames to the only pending request", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.allBalances();
    await flushMicrotasks();
    ws.receive({ status: "error", error: "rate limited" });

    await expect(promise).rejects.toMatchObject({ message: "rate limited" });
  });

  it("sends balances params in the server-supported shape", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.balances(["4,EOS", "8,CLOAK"], "atomicassets", "theauthcontr");
    await flushMicrotasks();

    const sent = JSON.parse(ws.sent.at(-1)!);
    expect(sent).toMatchObject({
      request: "balances",
      params: {
        ft_symbols: ["4,EOS", "8,CLOAK"],
        nft_contract: "atomicassets",
        at_contract: "theauthcontr",
      },
    });

    ws.receive({ id: sent.id, status: "success", result: { fts: ["0 4,EOS"], nfts: [], ats: { spent: [], unspent: [] } } });
    await expect(promise).resolves.toMatchObject({ fts: ["0 4,EOS"] });
  });

  it("returns successful transaction responses", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.transact([mintAction]);
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "success", result: { transaction_id: "abc" } });

    await expect(promise).resolves.toMatchObject({ status: "success", result: { transaction_id: "abc" } });
  });

  it("returns structured transaction error responses", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.transact([mintAction]);
    await flushMicrotasks();
    ws.receive({ id: lastSentId(ws), status: "error", error: "transaction declined" });

    await expect(promise).resolves.toMatchObject({ status: "error", error: "transaction declined" });
  });

  it("routes uncorrelated transaction error frames to the pending transaction", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.transact([mintAction]);
    await flushMicrotasks();
    ws.receive({ status: "error", error: "wallet failed before correlated response" });

    await expect(promise).resolves.toMatchObject({ status: "error", error: "wallet failed before correlated response" });
  });

  it("sends spend zactions unchanged", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.transact([spendAction]);
    await flushMicrotasks();

    const sent = JSON.parse(ws.sent.at(-1)!);
    expect(sent.params.zactions).toEqual([spendAction]);

    ws.receive({ id: sent.id, status: "success", result: { transaction_id: "spend" } });
    await expect(promise).resolves.toMatchObject({ status: "success" });
  });

  it("sends authenticate zactions with unpacked JSON action data unchanged", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.transact([authenticateAction]);
    await flushMicrotasks();

    const sent = JSON.parse(ws.sent.at(-1)!);
    expect(sent.params.zactions).toEqual([authenticateAction]);
    expect(sent.params.zactions[0].data.actions[0].data).toEqual({ round: 7 });
    expect("contract" in sent.params.zactions[0].data).toBe(false);

    ws.receive({ id: sent.id, status: "success", result: { transaction_id: "auth" } });
    await expect(promise).resolves.toMatchObject({ status: "success" });
  });

  it("rejects invalid zaction names", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    await login(session);

    await expect(session.transact([{ name: "transfer", data: {} } as never])).rejects.toThrow("zactions[0].name");
  });

  it("rejects packed authenticate action data on the JS side", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    await login(session);

    await expect(
      session.transact([
        {
          name: "authenticate",
          data: {
            auth_token: "$AUTH0",
            burn: true,
            actions: [
              {
                account: "claimcontract",
                name: "claimauctiop",
                authorization: ["claimcontract@active"],
                data: "deadbeef",
              },
            ],
          },
        } as never,
      ]),
    ).rejects.toThrow("must be an unpacked EOSIO JSON object");
  });

  it("throws timeout errors and clears pending requests", async () => {
    vi.useFakeTimers();
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);

    const promise = session.allBalances(true, true, true, { timeoutMs: 10 });
    await flushMicrotasks();
    expect(ws.sent.length).toBe(2);

    vi.advanceTimersByTime(11);
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it("rejects pending requests on logout", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    await login(session);

    const promise = session.allBalances();
    await flushMicrotasks();
    session.logout();

    await expect(promise).rejects.toBeInstanceOf(ConnectionError);
    expect(session.handle()).toBeNull();
  });

  it("cleans up when send throws", async () => {
    const session = new ZSession("wss://test", { WebSocket: MockWebSocket });
    const ws = await login(session);
    ws.failSend = true;

    await expect(session.allBalances()).rejects.toThrow("send failed");
  });
});
