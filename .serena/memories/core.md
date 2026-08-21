## What this is
`agentcore-payments-sample2` — AgentCore payments 検証用リポジトリ (pnpm monorepo), exploring the x402 payment protocol (HTTP-native machine-to-machine payments over EVM chains) plus AWS CDK infra.

Root `CLAUDE.md` now exists with the full commands + architecture writeup — read it first for anything beyond what's indexed here; these memories should stay a terse supplement, not a duplicate.

## Source map
- `apps/cdk` — AWS CDK (TypeScript) IaC. Entry `bin/cdk.ts`, stack `lib/cdk-stack.ts` (class `CdkStack`). Stack is currently a blank/unmodified scaffold — no AWS resources defined yet.
- `apps/x402/server` — Hono resource server, port 4021 (paywall). See `mem:x402_flow`.
- `apps/x402/facilitator` — Hono+viem service that verifies/settles payments on-chain. See `mem:x402_flow`.
- `apps/x402/client` — one-shot script demonstrating a paid request. See `mem:x402_flow`.
- `apps/mpp` — empty (reserved workspace path per `pnpm-workspace.yaml`, no package.json yet).
- `packages/` — declared in workspace globs but currently empty.

Each x402 app (`server`, `client`, `facilitator`) has its own `.env`/`.env.example`, loaded via `dotenv/config` — no shared/root `.env`. Never read/print `.env` contents into chat or commits.

## Project-wide invariants
- pnpm workspace; packages under `packages/*`, `apps/*`, `apps/x402/*`, `apps/mpp/*` (see `pnpm-workspace.yaml`).
- Root scripts proxy into workspaces by filter: `pnpm cdk <cmd>`, `pnpm x402server <cmd>`, `pnpm x402client <cmd>`, `pnpm facilitator <cmd>`.
- Formatting/linting centralized at root via Biome (`biome.json`), not per-package.
- Extensive `.claude/rules/*.md` govern this repo (code-style, git-workflow, testing, security, development workflow, learning-loop for auto-saving learnings, proactive subagent/skill usage) — these are auto-loaded as Claude project instructions and take precedence over generic behavior.

For commands see `mem:suggested_commands`; for stack/versions see `mem:tech_stack`; for completion checklist see `mem:task_completion`; for x402 payment-flow architecture see `mem:x402_flow`; for repo-specific code conventions see `mem:conventions`.
