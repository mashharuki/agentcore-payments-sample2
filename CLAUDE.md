# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`agentcore-payments-sample2` — a repository for verifying AgentCore payments. It is a pnpm monorepo exploring the **x402 payment protocol** (HTTP-native machine-to-machine payments over EVM chains) alongside AWS CDK infrastructure.

## Commands

Package manager is pinned: `pnpm@10.33.0`. Run everything with `pnpm`, not `npm`/`yarn`.

### Root-level (whole repo)
```
pnpm format   # biome format --write .
pnpm check    # biome check --write . (format + lint, auto-fix)
pnpm knip     # find unused files/exports/deps
pnpm jscpd    # copy-paste detection over apps/ and packages/
```

### Per-workspace, via root filter scripts
```
pnpm cdk <script>         # -> apps/cdk        (build, watch, test, synth, diff, deploy, destroy)
pnpm x402server dev       # -> apps/x402/server, tsx watch (no build step)
pnpm x402client dev       # -> apps/x402/client, tsx one-shot run
pnpm facilitator dev|build|start  # -> apps/x402/facilitator
```
Equivalent direct form: `pnpm --filter <pkg-name> <script>` (pkg names: `cdk`, `x402server`, `x402client`, `facilitator`).

### CDK specifics
```
pnpm cdk build      # tsc
pnpm cdk test       # jest (single test file: pnpm --filter cdk exec jest test/cdk.test.ts)
pnpm cdk synth
pnpm cdk diff
pnpm cdk deploy      # --require-approval never — confirm with the user before running, it's AWS-affecting
pnpm cdk destroy
```
Jest config (`apps/cdk/jest.config.js`) only picks up `**/*.test.ts` under `apps/cdk/test/`.

## Architecture

pnpm workspaces: `packages/*`, `apps/*`, `apps/x402/*`, `apps/mpp/*` (see `pnpm-workspace.yaml`). Currently `packages/` and `apps/mpp` are empty/reserved — only `apps/cdk` and `apps/x402/*` have code.

### apps/x402 — three independent services implementing the x402 payment flow

- **`apps/x402/server`** (Hono, port 4021) — a paywalled resource server.
  - `src/config.ts` exports `x402Config`, a single object keyed by `"METHOD /path"` (currently `"GET /weather"`) declaring accepted payment schemes/prices/networks per route (e.g. Base Sepolia `eip155:84532`, Worldchain Sepolia `eip155:4801`), plus Bazaar discovery metadata via `declareDiscoveryExtension`.
  - `src/facilitator.ts` builds an `HTTPFacilitatorClient` pointed at `process.env.FACILITATOR_URL` — this server does **not** verify/settle payments itself, it delegates to the facilitator service over HTTP.
  - `src/resourceServer.ts` creates an `x402ResourceServer` and registers `ExactEvmScheme` per chain ID.
  - `src/index.ts` wires `paymentMiddleware(x402Config, resourceServer)` into Hono; only routes listed in `x402Config` are paywalled (e.g. `/weather`), `/health` is not.
  - Adding a new paywalled route = add an entry to `x402Config` in `config.ts` + register any new chain in `resourceServer.ts`.

- **`apps/x402/facilitator`** (Hono + viem, port from `process.env.PORT` default 4022) — the service that actually verifies signed payments and settles them on-chain on behalf of resource servers.
  - `src/viem.ts` builds one viem wallet client (`getViemClientForChain`) and one `FacilitatorEvmSigner` (`getFacilitatorEvmSignerForChain`) **per chain** from a single `EVM_PRIVATE_KEY` account; currently wired for `worldchainSepolia` (`chainInfo`) and `baseSepolia` (`baseSepoliaChainInfo`). Adding a new chain means adding another `{chain, chainId}` pair and repeating the `getViemClientForChain`/`getFacilitatorEvmSignerForChain` calls in `src/index.ts`.
  - `src/index.ts` builds an `x402Facilitator`, registers both `ExactEvmScheme` and `UptoEvmScheme` per chain, and exposes `POST /verify`, `POST /settle`, `GET /supported`, `GET /health`. Facilitator lifecycle hooks (`onBeforeVerify`/`onAfterVerify`/`onVerifyFailure`/`onBeforeSettle`/`onAfterSettle`/`onSettleFailure`) are wired to `console.log` for observability — this is the place to hook in real logging/metrics.
  - Unlike server/client, this package has a real `build`/`start` (tsc → `node dist/index.js`) and is `"type": "module"`.

- **`apps/x402/client`** — a script (not a server) that demonstrates paying for a resource.
  - `src/viem.ts` creates a signer via `privateKeyToAccount(process.env.EVM_PRIVATE_KEY)`.
  - `src/config.ts` builds an `x402Client`, registers `ExactEvmScheme(signer)` for `eip155:4801`, restricts spend via `setSpendControls({ allowedAssets: [...] })`, then wraps an Axios instance (`baseURL: process.env.PAYWALL_API_BASE_URL`) with `wrapAxiosWithPayment` so payment challenges (HTTP 402) are handled transparently.
  - `src/index.ts` calls `api.get(process.env.PAYWALL_PATH)`, then uses `httpClient.parsePaymentResult(...)` to inspect whether the payment `settled` or `settle_failed`.

Payment flow across the three services: client requests a paywalled route on **server** → server returns 402 with payment requirements from `x402Config` → client's `x402Client`/`ExactEvmScheme` signs a payment payload and retries → server forwards `verify`/`settle` calls to **facilitator** (`FACILITATOR_URL`) → facilitator checks/executes the on-chain settlement via viem and returns the result → server returns the actual resource.

Chain IDs are always the CAIP-2 form `eip155:<chainId>` (Base Sepolia = `eip155:84532`, Worldchain Sepolia = `eip155:4801`). Keep this consistent when registering new networks in `x402Config`, `resourceServer.ts`, or the facilitator's `viem.ts`.

Each of the three x402 apps loads its own `.env` (via `dotenv/config`); there is no shared/root `.env`. Never print or commit `.env` contents.

### apps/cdk

Standard blank AWS CDK v2 (TypeScript) app: `bin/cdk.ts` instantiates `CdkStack` from `lib/cdk-stack.ts`. The stack is currently empty (no resources defined) — this is scaffolding for infra that will host/support the x402 services, not yet built out.

## Tooling notes

- Biome (`biome.json`) is the single formatter/linter for the whole repo (double quotes, space indent, recommended lint preset, import organization on). Run `pnpm check` from the root rather than per-package.
- `knip.json` only sets `tags: ["-lintignore"]` — no custom entry points configured, relies on knip's defaults across the workspace.

## AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

### Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
