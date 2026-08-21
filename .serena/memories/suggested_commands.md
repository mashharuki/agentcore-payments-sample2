Run from repo root unless noted.

## Format / lint (whole repo, Biome)
- `pnpm format` — biome format --write .
- `pnpm check` — biome check --write .
- `pnpm knip` — unused files/exports/deps check
- `pnpm jscpd` — copy-paste detection over `apps` and `packages`

## Per-workspace (via root filter scripts)
- `pnpm cdk <script>` → runs in `apps/cdk` (e.g. `pnpm cdk build`, `pnpm cdk synth`, `pnpm cdk diff`, `pnpm cdk deploy`, `pnpm cdk destroy`, `pnpm cdk test`)
- `pnpm x402server dev` → `apps/x402/server`, tsx watch
- `pnpm x402client dev` → `apps/x402/client`, tsx (one-shot)
- `pnpm facilitator dev|build|start` → `apps/x402/facilitator`

## Direct alternative
`pnpm --filter <pkg-name> <script>` also works directly (pkg names: `cdk`, `x402server`, `x402client`, `facilitator`).

## Darwin-specific notes
- No GNU-specific flags observed in scripts; nothing here diverges from standard macOS `git`/`ls`/`grep` behavior.
- CDK deploy/destroy are AWS-affecting and irreversible-ish — confirm with user before running.
