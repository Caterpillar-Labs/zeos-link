# zeos-link

`zeos-link` is a tiny browser SDK for connecting web applications to the local ZEOS Link WebSocket service.

It is intentionally small. It does not know about React, Next.js, Anchor, WharfKit, token icons, app state, or any specific dapp. It only wraps the ZEOS Link request/response protocol in a stable TypeScript API.

## What problem this solves

A browser app should not copy/paste a random `zeos-link.ts` file into its own `src/` tree and slowly mutate it into app-specific code.

This package provides one canonical SDK boundary:

- open/reuse a WebSocket connection to ZEOS Link
- send request frames with ids
- match response frames to pending requests
- handle login, balance queries, and private transactions
- expose a documented error contract
- build several consumption targets from one TypeScript source

## Installation

```bash
npm install zeos-link
```

## Usage with npm / bundlers

```ts
import ZSession from "zeos-link";

const session = new ZSession();

const login = await session.login({
  chain_id: "...",
  protocol_contract: "...",
  vault_contract: "...",
  alias_authority: "...",
});

if (!login) {
  console.log("User declined login");
} else {
  console.log("Connected handle:", session.handle());
}
```

## Usage as a browser ES module

Copy `dist/zeos-link.js` into your app's `public/` folder or serve it from a fixed external origin.

```html
<script type="module">
  import ZSession from "/zeos-link.js";

  const session = new ZSession();
  console.log(session.isConnected());
</script>
```

## Usage as a global browser script

```html
<script src="/zeos-link.global.js"></script>
<script>
  const session = new ZEOSLink.ZSession();
</script>
```

The ES module build is preferred. The global build exists for simple static pages and legacy integrations.

## CDN usage

After publishing to npm, the generated browser files can be loaded from an npm CDN.

Pin exact versions in production:

```html
<script type="module">
  import ZSession from "https://unpkg.com/zeos-link@0.1.0/dist/zeos-link.js";
</script>
```

Do **not** use `@latest` in production apps.

## Public API

```ts
export class ZSession {
  constructor(url?: string, options?: ZSessionOptions);

  login(chain: ZeosLinkChainParams, onClose?: () => void): Promise<ZeosLinkLoginResult | null>;
  logout(): void;

  isConnected(): boolean;
  handle(): string | null;

  allBalances(
    ft?: boolean,
    nft?: boolean,
    at?: boolean,
    opts?: ZeosLinkRequestOptions,
  ): Promise<ZeosLinkBalancesResult>;

  balances(
    ftSymbols?: string[] | Record<string, unknown>,
    nftContract?: string | Record<string, unknown>,
    atContract?: string | Record<string, unknown>,
    opts?: ZeosLinkRequestOptions,
  ): Promise<ZeosLinkBalancesResult>;

  transact(
    zactions: ZeosLinkZAction[],
    addFee?: boolean,
    publishFeeNote?: boolean,
    opts?: ZeosLinkRequestOptions,
  ): Promise<ZeosLinkTransactResult>;
}

export default ZSession;
```

## Default WebSocket URL

By default, `ZSession` connects to:

```ts
wss://127.0.0.1:9367
```

Override it when needed:

```ts
const session = new ZSession("wss://127.0.0.1:9367");
```

## Login

```ts
const result = await session.login({
  chain_id: "...",
  protocol_contract: "...",
  vault_contract: "...",
  alias_authority: "...",
});
```

Behavior:

- returns a ZEOS Link login response on success
- returns `null` when the user declines login
- throws for socket/network/timeouts/unexpected protocol failures
- stores the chain parameters only after successful login
- updates `session.handle()` when ZEOS Link returns a string handle

Optional close callback:

```ts
await session.login(chain, () => {
  console.log("ZEOS Link socket closed");
});
```

## Balances

Query all balance categories:

```ts
const balances = await session.allBalances(true, true, true);
```

Query filtered balances:

```ts
const balances = await session.balances(["4,EOS"], "nft.contract", "auth.contract");
```

Balance request errors throw. They do not return `{ status: "error" }`.

## Transactions

```ts
const result = await session.transact([
  {
    name: "transfer",
    data: {
      // protocol-specific private action data
    },
  },
]);

if (result.status === "error") {
  console.error("Transaction failed:", result.error);
} else {
  console.log("Transaction result:", result);
}
```

`transact()` requires a successful `login()` first.

Default transaction options:

```ts
await session.transact(zactions, true, true, { timeoutMs: 60000 });
```

Arguments:

- `zactions`: array of ZEOS Link private actions
- `addFee`: defaults to `true`
- `publishFeeNote`: defaults to `true`
- `opts.timeoutMs`: defaults to `60000`

## Error contract

This contract is part of the SDK API and should not be changed casually.

| Case | Behavior |
| --- | --- |
| Login accepted | resolves with `ZeosLinkLoginResult` |
| Login declined by user | resolves with `null` |
| Socket unavailable | throws `ZeosLinkConnectionError` |
| Socket/network failure | throws `ZeosLinkConnectionError` |
| Request timeout | throws `ZeosLinkTimeoutError` |
| Balance protocol error | throws `ZeosLinkProtocolError` |
| Transaction success | resolves with `ZeosLinkTransactResult` |
| Transaction protocol/wallet error frame | resolves with `ZeosLinkTransactResult` where `status === "error"` |
| Transaction uncorrelated error frame while a transaction is pending | resolves the pending transaction with `status === "error"` |
| Malformed unsolicited frame | ignored |
| Uncorrelated non-transaction frame | ignored |
| `logout()` while requests are pending | rejects pending requests and clears local session state |

Important distinction:

- balance errors throw
- socket errors throw
- timeouts throw
- login decline returns `null`
- transaction wallet/protocol failure returns a structured transaction result with `status: "error"`

This is deliberate. Transaction failures are often useful app-level results, while balance failures usually mean the request did not complete correctly.

## Request frame shape

The SDK sends JSON frames shaped like:

```ts
{
  id: number,
  request: string,
  params: unknown,
}
```

Examples:

```ts
{ id: 1, request: "login", params: chain }
{ id: 2, request: "all_balances", params: { ft: true, nft: true, at: true } }
{ id: 3, request: "balances", params: { ft_symbols, nft_contract, at_contract } }
{ id: 4, request: "transact", params: { chain_id, protocol_contract, vault_contract, alias_authority, add_fee, publish_fee_note, zactions } }
```

## Response frame shape

ZEOS Link responses are expected to include the matching `id` where possible:

```ts
{
  id: number,
  status: "success" | "error",
  result?: unknown,
  error?: string,
}
```

The SDK also defensively handles a transaction error frame without an id while a transaction request is pending. That behavior exists because wallet/UIs sometimes fail before returning a perfectly correlated response frame.

## Build outputs

The repo builds these artifacts from the same TypeScript source:

```txt
dist/index.mjs            npm ESM
dist/index.cjs            npm CommonJS
dist/index.d.ts           TypeScript declarations
dist/zeos-link.js         standalone browser ES module
dist/zeos-link.min.js     minified standalone browser ES module
dist/zeos-link.global.js  global browser script exposing ZEOSLink
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Before publishing:

```bash
npm run prepublishOnly
```

## Testing strategy

Tests should use a fake WebSocket implementation. Do not require a real local ZEOS Link wallet/service in CI.

Minimal regression coverage:

- login success returns result and stores handle
- login declined returns `null`
- `allBalances()` success returns `result`
- balance protocol error throws
- transaction success returns full response
- transaction matching `status: "error"` resolves as a result
- transaction uncorrelated `status: "error"` resolves the pending transaction
- timeout clears pending request and throws
- logout rejects pending requests and clears state
- send failure clears pending request
- socket close calls the external close callback after login

## Security notes

- The app must pass the correct chain parameters. The SDK validates presence, not semantic correctness.
- The app must not assume the user is logged in just because the WebSocket is open.
- Always inspect transaction `status`; do not assume a resolved transaction means success.
- Pin CDN versions in production.
- Do not expose private app state through SDK callbacks.
- Keep this package dependency-free unless there is a strong reason to add a runtime dependency.

## Versioning policy

Use semantic versioning.

Breaking changes include:

- changing method names or argument order
- changing the error contract
- changing transaction failure from resolve to throw, or vice versa
- changing response normalization
- removing browser build artifacts

Non-breaking changes include:

- adding optional fields to result types
- adding optional constructor options
- improving internal socket cleanup without changing observable behavior

## Maintainer notes for humans and AI models

The most important design rule: **this package owns the ZEOS Link SDK boundary, not any app wallet abstraction.**

Do not add:

- React state
- app-specific balance formatting
- token icons
- Anchor/WharfKit native transaction compatibility
- CLOAK app service imports
- EOSIO library dependencies just for typing convenience

If a consuming app supports multiple wallets, that app should normalize wallet behavior in its own adapter layer. `zeos-link` should stay focused on the ZEOS Link WebSocket protocol.
