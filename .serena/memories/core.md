## What this is
`agentcore-payments-sample2` — AgentCore payments 検証用リポジトリ (pnpm monorepo).

## Source map
- `apps/cdk` — AWS CDK (TypeScript) IaC. Entry `bin/cdk.ts`, stack `lib/cdk-stack.ts` (class `CdkStack`).
- `apps/x402/server` — Hono-based x402 resource server (`src/index.ts`, `src/resourceServer.ts`, `src/facilitator.ts`, `src/config.ts` exporting `x402Config`).
- `apps/x402/client` — x402 client using `@x402/fetch`/`@x402/axios` + `@coinbase/cdp-sdk` + `viem` (`src/index.ts`, `src/viem.ts`, `src/config.ts`).
- `apps/x402/facilitator` — x402 facilitator service (Hono + viem), `src/index.ts`, `src/viem.ts`.
- `apps/mpp` — currently empty (reserved workspace path per `pnpm-workspace.yaml`, no package.json yet).
- `packages/` — declared in workspace globs but currently empty.

Each x402 app (`server`, `client`, `facilitator`) has its own `.env`/`.env.example` — never read/print `.env` contents into chat or commits.

## Project-wide invariants
- pnpm workspace; packages under `packages/*`, `apps/*`, `apps/x402/*`, `apps/mpp/*` (see `pnpm-workspace.yaml`).
- Root scripts proxy into workspaces by filter: `pnpm cdk <cmd>`, `pnpm x402server <cmd>`, `pnpm x402client <cmd>`, `pnpm facilitator <cmd>`.
- Formatting/linting centralized at root via Biome (`biome.json`), not per-package.
- Extensive `.claude/rules/*.md` govern this repo (code-style, git-workflow, testing, security, development workflow, learning-loop for auto-saving learnings, proactive subagent/skill usage) — these are auto-loaded as Claude project instructions and take precedence; Serena memories here are a supplement, not a replacement.

For commands see `mem:suggested_commands`; for stack/versions see `mem:tech_stack`; for completion checklist see `mem:task_completion`.
