General TS/code-style/testing/security rules are defined in `.claude/rules/code-style.md`, `.claude/rules/testing.md`, `.claude/rules/security.md` (auto-loaded as Claude project instructions) — follow those, not duplicated here.

Repo-specific, non-obvious conventions observed in code:
- x402 config values live in per-app `src/config.ts` as a single exported constant (e.g. `x402Config` in `apps/x402/server/src/config.ts`) rather than scattered `process.env` reads.
- `apps/x402/facilitator` is `"type": "module"` (ESM); `server`/`client` package.json files do not set `"type"`, so check before assuming module format when editing.
- No test files currently exist under `apps/x402/*`; `apps/cdk` is the only workspace with a configured test runner (Jest, see `apps/cdk/jest.config.js`).
- Chain IDs use CAIP-2 form (`eip155:<id>`) throughout x402 config/registration code — see `mem:x402_flow` for the full convention and current chain IDs in use.
- Each x402 app loads env via `import "dotenv/config"` (or `dotenv.config()` in facilitator) at the top of the relevant `src/*.ts` file, not via a shared bootstrap.
