Before considering a coding task done in this repo:
1. `pnpm check` (Biome format+lint, auto-fixes) at repo root.
2. If `apps/cdk` was touched: `pnpm cdk build` and `pnpm cdk test` (Jest).
3. If x402 server/client/facilitator source touched: at minimum start the relevant `dev` script once to confirm it boots (they have no test suites currently — see `mem:tech_stack`).
4. `pnpm knip` if imports/exports/deps were added or removed, to catch unused code.
5. Follow `.claude/rules/git-workflow.md` for commit style (Conventional Commits, atomic commits, no direct push to `main`) — this is enforced as project instruction, not optional.
