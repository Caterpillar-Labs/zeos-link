# zeos-link

Browser SDK for connecting web apps to the local **CLOAK / ZEOS Link** wallet service.

`zeos-link` is a tiny TypeScript SDK that talks to the CLOAK desktop wallet over a local secure WebSocket connection. It lets a web app request login approval, query private wallet balances, and submit shielded ZEOS actions for wallet-side signing/publishing.

The default connection target is:

```txt
wss://127.0.0.1:9367
```

This package is intentionally small. It is **not** a general EOSIO wallet SDK, not a WharfKit replacement, and not a React state manager. It is only the browser-side client for the CLOAK wallet's local ZEOS Link protocol.

---

## TL;DR for humans and AI agents

Use this package when a web app wants to support the **CLOAK wallet**.

Core flow:

```ts
import ZSession from "zeos-link";

const session = new ZSession();

const login = await session.login({
  chain_id: "...",
  protocol_contract: "thezeosproto",
  vault_contract: "thezeosvault",
  alias_authority: "thezeosalias@public",
});

if (!login) {
  // User declined, wallet network mismatch, or wallet rejected login.
  return;
}

const balances = await session.allBalances(true, true, true);

const tx = await session.transact(
  [
    {
      name: "transfer",
      data: {
        // protocol-specific shielded action data
      },
    },
  ],
  true,
  true,
);
```

Important:

- The CLOAK wallet must be running locally.
- The wallet exposes a secure WebSocket server on `wss://127.0.0.1:9367`.
- Login opens a native wallet approval dialog.
- Balance requests may open a native wallet approval dialog.
- Transactions open a native wallet signature dialog.
- `login()` returns `null` for expected wallet rejection/decline.
- Balance protocol errors throw.
- `transact()` returns successful transaction responses and structured transaction error responses.
- Network/socket/timeout failures throw.
- This SDK only supports ZEOS/CLOAK shielded `zactions`, **not** Anchor/WharfKit `{ actions: [...] }` transactions.

---

## Installation

```bash
npm install zeos-link
```

---

## Usage with npm / bundlers

```ts
import ZSession from "zeos-link";

const session = new ZSession();
```

Named import also works:

```ts
import { ZSession } from "zeos-link";
```

---

## Usage as a browser ES module

You can copy the built browser file into your public assets and import it directly:

```html
<script type="module">
  import ZSession from "/zeos-link.js";

  const session = new ZSession();
</script>
```

When installed from npm, the browser ESM build is available at:

```txt
node_modules/zeos-link/dist/zeos-link.js
```

---

## Usage as a global browser script

The package also builds a global script for projects that do not use ESM.

```html
<script src="/zeos-link.global.js"></script>
<script>
  const session = new ZEOSLink.ZSession();
</script>
```

Prefer the ESM build for modern apps.

---

## What this SDK does

`zeos-link` handles:

- opening/reusing a WebSocket connection to the local CLOAK wallet,
- sending request frames with unique request ids,
- correlating wallet replies back to the pending request,
- timing out stale requests,
- converting expected login rejection into `null`,
- throwing typed protocol/connection/timeout errors where appropriate,
- handling known wallet-server quirks such as id-less rate-limit errors and uncorrelated transaction error frames.

---

## What this SDK does not do

This SDK does **not**:

- manage React state,
- store wallet sessions in localStorage,
- choose the app's active network,
- format balances for UI,
- resolve token icons,
- support Anchor/WharfKit native EOSIO transactions,
- validate your dapp's business rules,
- replace server-side authorization or transaction validation.

Keep those responsibilities in your app.

---

## CLOAK wallet / ZEOS Link architecture

The CLOAK desktop wallet runs a local secure WebSocket server.

```txt
web app
  |
  |  wss://127.0.0.1:9367
  v
CLOAK desktop wallet
  |
  |  native approval/signature dialogs
  v
ZEOS wallet core / chain RPC
```

The wallet listens on localhost only. This is intentional: the desktop wallet acts as a local signer, not as a remote public API.

The browser app sends JSON request frames. The wallet validates them, optionally shows a native Qt approval dialog, and replies with JSON response frames.

---

## Protocol frame shape

Every SDK request uses this shape:

```json
{
  "id": 1,
  "request": "login",
  "params": {}
}
```

Normal responses echo the request id:

```json
{
  "id": 1,
  "status": "success",
  "result": {}
}
```

Error responses usually echo the request id:

```json
{
  "id": 1,
  "status": "error",
  "error": "not logged in"
}
```

Some low-level server errors may not include an id, for example rate limiting or message-size rejection. The SDK handles id-less `status: "error"` frames by routing them to the only pending request when there is exactly one pending request.

---

## Supported requests

The CLOAK wallet currently supports these request names:

```txt
login
all_balances
balances
transact
```

Unknown requests receive:

```json
{
  "status": "error",
  "error": "unknown request"
}
```

---

## Login

### API

```ts
const result = await session.login(chain, onClose);
```

### Type

```ts
login(
  chain: ZeosLinkChainParams,
  onClose?: () => void
): Promise<ZeosLinkLoginResult | null>
```

### Chain params

```ts
type ZeosLinkChainParams = {
  chain_id: string;
  protocol_contract: string;
  vault_contract: string;
  alias_authority: string;
};
```

Example:

```ts
const login = await session.login({
  chain_id: "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906",
  protocol_contract: "thezeosproto",
  vault_contract: "thezeosvault",
  alias_authority: "thezeosalias@public",
});
```

### Login behavior

The wallet validates that the provided login fields match the wallet's currently active network configuration.

The wallet checks:

```txt
chain_id
protocol_contract
vault_contract
alias_authority
```

`alias_authority` is expected in this form:

```txt
account@permission
```

Example:

```txt
thezeosalias@public
```

If the params do not match the wallet's active network, the wallet rejects the login.

If the params match, the wallet opens a native login approval dialog. The user must accept the request in the CLOAK wallet.

### Login result

On approval:

```ts
const login = await session.login(chain);

if (login) {
  console.log("Connected", login.result);
}
```

On expected rejection:

```ts
const login = await session.login(chain);

if (!login) {
  // User declined, wallet rejected login, or active wallet network did not match.
}
```

`login()` returns `null` for expected wallet-level rejection. It throws only for transport/runtime failures such as connection errors, malformed replies, or timeouts.

### Important: do not treat the login result as a public account

The CLOAK wallet may return an opaque/private handle such as `"anonymous"`. This is not a normal public EOSIO account identity. Do not use it as proof of account ownership.

---

## Logout

```ts
session.logout();
```

This closes the WebSocket connection, clears the locally stored chain params and handle, and rejects pending requests.

It does not alter wallet state inside the desktop wallet.

---

## Connection status

```ts
session.isConnected();
```

Returns whether the underlying WebSocket is currently open.

```ts
session.handle();
```

Returns the current wallet handle from the login response, or `null`.

Again: the handle is not a public EOSIO account identity.

---

## Query all balances

### API

```ts
const balances = await session.allBalances(true, true, true);
```

### Type

```ts
allBalances(
  ft?: boolean,
  nft?: boolean,
  at?: boolean,
  opts?: ZeosLinkRequestOptions
): Promise<ZeosLinkBalancesResult>
```

### Request params

The SDK sends:

```json
{
  "request": "all_balances",
  "params": {
    "ft": true,
    "nft": true,
    "at": true
  }
}
```

Meaning:

```txt
ft  = fungible token balances
nft = non-fungible token balances
at  = authentication tokens
```

### Result shape

Typical result:

```ts
type ZeosLinkBalancesResult = {
  fts?: string[];
  nfts?: unknown[];
  ats?: {
    spent: string[];
    unspent: string[];
  };
};
```

Example:

```ts
const balances = await session.allBalances(true, false, false);

console.log(balances.fts);
```

### User approval

The wallet may show a native balance-request approval dialog. Do not assume this is a silent background query.

---

## Query filtered balances

### API

```ts
const balances = await session.balances(
  ["4,EOS", "8,CLOAK"],
  "atomicassets",
  "theauthcontr",
);
```

### Type

```ts
balances(
  ftSymbols?: string[],
  nftContract?: string,
  atContract?: string,
  opts?: ZeosLinkRequestOptions
): Promise<ZeosLinkBalancesResult>
```

### Request params

The SDK sends:

```json
{
  "request": "balances",
  "params": {
    "ft_symbols": ["4,EOS", "8,CLOAK"],
    "nft_contract": "atomicassets",
    "at_contract": "theauthcontr"
  }
}
```

The wallet server expects:

```txt
ft_symbols   array of strings
nft_contract string
at_contract  string
```

Object-shaped filters are not part of the current protocol.

### Fungible token symbol format

Use EOSIO-style symbol strings:

```txt
precision,SYMBOL
```

Examples:

```txt
4,EOS
8,CLOAK
3,UN
```

When a requested fungible token balance is not found, the wallet may return a zero balance for that symbol.

---

## Transact

### API

```ts
const result = await session.transact(zactions);
```

### Type

```ts
transact(
  zactions: ZeosLinkZAction[],
  addFee?: boolean,
  publishFeeNote?: boolean,
  opts?: ZeosLinkRequestOptions
): Promise<ZeosLinkTransactResult>
```

### ZAction shape

```ts
type ZeosLinkZAction = {
  name: string;
  data: Record<string, unknown>;
};
```

Example:

```ts
const result = await session.transact(
  [
    {
      name: "transfer",
      data: {
        // shielded action payload
      },
    },
  ],
  true,
  true,
);
```

The SDK sends a `transact` request with the active login chain params:

```json
{
  "request": "transact",
  "params": {
    "chain_id": "...",
    "protocol_contract": "...",
    "vault_contract": "...",
    "alias_authority": "...",
    "add_fee": true,
    "publish_fee_note": true,
    "zactions": []
  }
}
```

### `addFee`

When `true`, the wallet is asked to include the required protocol fee behavior.

Default:

```txt
true
```

### `publishFeeNote`

When `true`, the wallet is asked to publish the fee note when relevant.

Default:

```txt
true
```

### Important: this is not Anchor / WharfKit

This is valid for CLOAK / ZEOS Link:

```ts
await session.transact([
  {
    name: "transfer",
    data: {},
  },
]);
```

This is **not** a ZEOS Link transaction:

```ts
await session.transact({
  actions: [
    {
      account: "eosio.token",
      name: "transfer",
      data: {},
    },
  ],
});
```

`{ actions: [...] }` belongs to Anchor, WharfKit, or other native EOSIO wallet/session APIs. Do not mix those shapes into this SDK.

---

## Request options

Most request methods accept:

```ts
type ZeosLinkRequestOptions = {
  timeoutMs?: number;
};
```

Examples:

```ts
await session.login(chain, undefined, {
  timeoutMs: 30000,
});
```

For methods that expose `opts`:

```ts
await session.allBalances(true, true, true, {
  timeoutMs: 30000,
});

await session.transact(zactions, true, true, {
  timeoutMs: 120000,
});
```

Recommended defaults:

```txt
login        30s
balances     15s
transact     60s or longer for proof-generation-heavy flows
```

Transaction signing can be slow because the wallet may need to resolve, prove, sign, and publish a shielded transaction.

---

## Error contract

This is the most important API contract.

### Login

```txt
login approved
  -> resolves ZeosLinkLoginResult

user declined login
  -> resolves null

wallet network mismatch
  -> resolves null

wallet rejects login params
  -> resolves null

socket/network/timeout/runtime failure
  -> throws
```

Use:

```ts
try {
  const login = await session.login(chain);

  if (!login) {
    // Expected wallet-level rejection.
    return;
  }

  // Connected.
} catch (err) {
  // Transport/runtime failure.
}
```

### Balances

```txt
balance request approved
  -> resolves ZeosLinkBalancesResult

wallet protocol error
  -> throws ZeosLinkProtocolError

rate limited / message too large
  -> throws protocol-style error

socket/network/timeout/runtime failure
  -> throws
```

Use:

```ts
try {
  const balances = await session.allBalances(true, true, true);
} catch (err) {
  // Show a real error. Do not treat as "no balances".
}
```

### Transact

```txt
transaction approved and processed
  -> resolves ZeosLinkTransactResult with status: "success"

transaction rejected/failed at wallet/protocol level
  -> resolves ZeosLinkTransactResult with status: "error"

uncorrelated transaction error frame from wallet
  -> resolves structured transaction error result

socket/network/timeout/runtime failure
  -> throws
```

Use:

```ts
try {
  const result = await session.transact(zactions);

  if (result.status === "error") {
    // Wallet/protocol-level transaction failure.
    console.error(result.error);
    return;
  }

  // Success.
} catch (err) {
  // Transport/runtime failure.
}
```

Why transaction errors resolve instead of throw:

A transaction can fail after the wallet has accepted the request and attempted to resolve/sign/publish. That is a wallet/protocol result, not necessarily a broken SDK transport. Apps should inspect `result.status`.

---

## Error handling pattern

Recommended app-side helper:

```ts
import {
  ZeosLinkProtocolError,
  ZeosLinkTimeoutError,
  ZeosLinkConnectionError,
} from "zeos-link";

function describeZeosLinkError(err: unknown): string {
  if (err instanceof ZeosLinkTimeoutError) {
    return "The CLOAK wallet did not respond in time.";
  }

  if (err instanceof ZeosLinkConnectionError) {
    return "Could not connect to the local CLOAK wallet.";
  }

  if (err instanceof ZeosLinkProtocolError) {
    return err.message || "The CLOAK wallet rejected the request.";
  }

  if (err instanceof Error) {
    return err.message;
  }

  return "Unknown CLOAK wallet error.";
}
```

Then:

```ts
try {
  const balances = await session.allBalances(true, true, true);
} catch (err) {
  notifyUser(describeZeosLinkError(err));
}
```

---

## Detecting whether CLOAK wallet is available

The simplest check is attempting login or opening a session.

```ts
const session = new ZSession();

try {
  const login = await session.login(chain);
  if (!login) {
    console.log("Wallet rejected login or user declined.");
  }
} catch (err) {
  console.log("CLOAK wallet is unavailable or unreachable.");
}
```

Common reasons connection fails:

```txt
- CLOAK desktop wallet is not running
- no wallet is open inside CLOAK
- local WSS server is not listening
- browser rejected the local TLS certificate
- browser/app origin is blocked by future wallet origin policy
- local firewall/proxy/security software interferes with localhost WSS
```

---

## React integration pattern

Keep the SDK instance in app wallet state, not inside random components.

Example sketch:

```ts
import ZSession from "zeos-link";

const session = new ZSession();

const login = await session.login(chain, () => {
  // Wallet socket closed.
  // Clear app wallet state here.
});

if (!login) {
  // User declined or wallet rejected.
  return;
}

// Store session as the active CLOAK wallet session.
walletSessionRef.current = session;
walletTypeRef.current = "CLOAK";
```

After transaction:

```ts
const result = await session.transact(zactions, true, true, {
  timeoutMs: 120000,
});

if (result.status === "error") {
  // Show transaction error.
  return;
}

// Refresh balances / local app state.
```

Do not expose `ZSession` internals to UI components. Wrap it in your app's wallet adapter.

---

## Suggested app adapter boundary

Good:

```txt
app wallet adapter
  - knows about React state
  - knows selected network
  - knows token icons
  - knows notifications
  - owns walletSessionRef
  - imports ZSession from zeos-link
```

Bad:

```txt
zeos-link SDK
  - imports React app types
  - knows about token icons
  - knows about app notifications
  - supports Anchor/WharfKit transaction shapes
```

Keep `zeos-link` boring and protocol-focused.

---

## Security notes

### Localhost only

The CLOAK wallet is expected to listen on localhost:

```txt
wss://127.0.0.1:9367
```

Do not expose the wallet WSS server on a public network interface.

### Validate chain params in the app

The SDK validates basic string shape. Your app is still responsible for choosing the correct network config.

Wrong chain params should fail login, but do not rely on wallet rejection as your only safety layer.

### Treat wallet dialogs as the security boundary

Login, balance reads, and transactions can show native wallet dialogs. Design UX around that.

Do not spam wallet prompts.

### Do not assume login means public account identity

CLOAK is a privacy wallet. The login result is an opaque wallet handle, not a public account proof.

### Pin CDN versions

If loading from a CDN, pin exact versions.

Good:

```html
<script type="module">
  import ZSession from "https://unpkg.com/zeos-link@0.1.0/dist/zeos-link.js";
</script>
```

Bad:

```html
<script type="module">
  import ZSession from "https://unpkg.com/zeos-link@latest/dist/zeos-link.js";
</script>
```

### Never auto-submit sensitive transactions

Always let the wallet approval/signature dialog be visible to the user. The dapp should make it clear what the user is about to do before calling `transact()`.

---

## Raw protocol examples

You normally do not need this when using the SDK, but it is useful for debugging and for AI agents reading the repo.

### Login request

```json
{
  "id": 1,
  "request": "login",
  "params": {
    "chain_id": "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906",
    "protocol_contract": "thezeosproto",
    "vault_contract": "thezeosvault",
    "alias_authority": "thezeosalias@public"
  }
}
```

### Login success

```json
{
  "id": 1,
  "status": "success",
  "result": "anonymous"
}
```

### Login rejection

```json
{
  "id": 1,
  "status": "error",
  "error": "declined"
}
```

or:

```json
{
  "id": 1,
  "status": "error",
  "error": "login declined"
}
```

### All balances request

```json
{
  "id": 2,
  "request": "all_balances",
  "params": {
    "ft": true,
    "nft": true,
    "at": true
  }
}
```

### Filtered balances request

```json
{
  "id": 3,
  "request": "balances",
  "params": {
    "ft_symbols": ["4,EOS", "8,CLOAK"],
    "nft_contract": "atomicassets",
    "at_contract": "theauthcontr"
  }
}
```

### Transact request

```json
{
  "id": 4,
  "request": "transact",
  "params": {
    "chain_id": "...",
    "protocol_contract": "...",
    "vault_contract": "...",
    "alias_authority": "...",
    "add_fee": true,
    "publish_fee_note": true,
    "zactions": [
      {
        "name": "transfer",
        "data": {}
      }
    ]
  }
}
```

### Error response

```json
{
  "id": 4,
  "status": "error",
  "error": "not logged in"
}
```

### Id-less low-level error

```json
{
  "status": "error",
  "error": "rate limited"
}
```

The SDK handles this if exactly one request is pending.

---

## Development

Install dependencies:

```bash
npm install
```

Typecheck:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build:

```bash
npm run build
```

The build outputs:

```txt
dist/index.mjs
dist/index.cjs
dist/index.d.ts
dist/index.d.cts
dist/zeos-link.js
dist/zeos-link.min.js
dist/zeos-link.global.js
```

---

## Smoke test package exports

From outside the repo:

```bash
mkdir /tmp/zeos-link-smoke
cd /tmp/zeos-link-smoke
npm init -y
npm install zeos-link
```

Test ESM:

```bash
node -e "import('zeos-link').then(m => console.log(typeof m.default, typeof m.ZSession))"
```

Expected:

```txt
function function
```

Test CJS:

```bash
node -e "const m = require('zeos-link'); console.log(typeof m.default, typeof m.ZSession)"
```

Expected:

```txt
function function
```

---

## Publishing

Before publishing:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Publish:

```bash
npm publish
```

Tag release:

```bash
git tag v0.1.0
git push origin main --tags
```

---

## Migration from baked-in app code

If your app currently has a local copy such as:

```txt
src/services/wallet/zSessionService.ts
```

replace the implementation with the package.

Before:

```ts
import ZSession from "./zSessionService";
```

After:

```ts
import ZSession from "zeos-link";
```

Then delete the baked-in SDK copy.

Do not change unrelated wallet paths. In particular, do not change Anchor/WharfKit/native wallet transaction flows that use:

```ts
session.transact({ actions: [...] });
```

ZEOS Link only supports shielded CLOAK `zactions`.

---

## Minimal real-world validation checklist

After integrating into a dapp, test against the real CLOAK wallet:

```txt
1. CLOAK wallet closed -> login throws connection error
2. CLOAK wallet open but login declined -> login returns null
3. wrong chain params -> login returns null
4. correct chain params + approval -> login succeeds
5. allBalances(ft=true,nft=true,at=true) -> returns balances after wallet approval
6. balances([...], nftContract, atContract) -> returns filtered balances after wallet approval
7. transact(valid zactions) -> wallet signature dialog appears
8. declined/failed transaction -> transact resolves status:error
9. successful transaction -> transact resolves status:success
10. logout -> socket closes and app state clears
11. reconnect -> login flow works again
```

Do not call the integration complete until these pass.

---

## Design principles

This SDK should remain:

```txt
small
browser-first
dependency-light
protocol-focused
boring
```

Do not add app-specific concepts unless they are truly part of the CLOAK / ZEOS Link protocol.

