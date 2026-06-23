# Changelog

## 0.3.0

Breaking change: align `all_balances` wire params with the CLOAK desktop wallet.

- `allBalances()` now sends `ft`, `nft_contract`, and `at_contract` instead of boolean `nft` / `at`
- add `AllBalancesParams`, `ALL_WALLET_CONTRACTS`
- `balances()` is implemented via `all_balances` with client-side FT filtering

## 0.1.0

Initial repository scaffold.

- Standalone TypeScript SDK source
- npm ESM/CJS builds
- standalone browser ES module build
- optional browser global build
- TypeScript declarations
- documented error contract
- fake-WebSocket unit test scaffold
