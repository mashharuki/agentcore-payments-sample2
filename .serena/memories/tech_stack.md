## Language / package manager
- TypeScript throughout. Package manager pinned: `pnpm@10.33.0` (root `packageManager` field — use pnpm, not npm/yarn).
- Root devDeps: `typescript ^7.0.2`, `@biomejs/biome 2.5.9`, `knip ^6.32.2`, `@types/node ^26.2.0`.

## apps/cdk
- AWS CDK v2 (`aws-cdk-lib ^2.260.0`, `aws-cdk 2.1129.0`), `constructs ^10.5.0`.
- Test runner: Jest 30 + ts-jest. Build via `tsc`.

## apps/x402/server
- Hono (`hono`, `@hono/node-server`) resource server.
- x402 protocol packages: `@x402/core`, `@x402/evm`, `@x402/avm`, `@x402/svm`, `@x402/extensions`, `@x402/hono` (all `^2.23.0`).
- Run via `tsx watch` (no build step).

## apps/x402/client
- `@x402/fetch`, `@x402/axios`, `@x402/evm`, `viem ^2.55.19`, `@coinbase/cdp-sdk ^1.55.0` (also aliased as `cdp-sdk`).
- Run via `tsx` (no watch).

## apps/x402/facilitator
- Hono + viem + `@x402/core`, `@x402/evm`. Has an actual `build`/`start` (tsc -> node dist), unlike server/client which are dev-only via tsx.
- `"type": "module"` in package.json.

## Formatting/linting
- Biome 2.5.9, config at root `biome.json`: double quotes for JS, space indent, recommended lint preset, VCS integration disabled, import organization on.
