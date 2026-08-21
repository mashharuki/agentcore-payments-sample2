Three independent services implement the x402 payment protocol end-to-end. Full narrative is in root `CLAUDE.md`; this is the condensed reference.

## Services
- **server** (`apps/x402/server`, Hono, port 4021): paywalled resource server. `src/config.ts` exports `x402Config`, keyed by `"METHOD /path"` (e.g. `"GET /weather"`), declaring accepted schemes/prices/networks per route + Bazaar discovery metadata (`declareDiscoveryExtension`). `src/facilitator.ts` builds `HTTPFacilitatorClient` pointed at `FACILITATOR_URL` — server delegates verify/settle to the facilitator, never does it itself. `src/resourceServer.ts` creates `x402ResourceServer` and registers `ExactEvmScheme` per chain ID. `src/index.ts` wires `paymentMiddleware(x402Config, resourceServer)`; only routes in `x402Config` are paywalled (`/health` is not).
- **facilitator** (`apps/x402/facilitator`, Hono+viem, port `PORT` default 4022): verifies signed payments and settles on-chain. `src/viem.ts` builds one viem wallet client + one `FacilitatorEvmSigner` **per chain** from a single `EVM_PRIVATE_KEY` account; wired for `worldchainSepolia` and `baseSepolia`. `src/index.ts` registers both `ExactEvmScheme` and `UptoEvmScheme` per chain, exposes `POST /verify`, `POST /settle`, `GET /supported`, `GET /health`; lifecycle hooks (`onBeforeVerify`/`onAfterVerify`/`onVerifyFailure`/`onBeforeSettle`/`onAfterSettle`/`onSettleFailure`) currently just `console.log` — natural hook point for real logging/metrics.
- **client** (`apps/x402/client`): one-shot script, not a server. `src/viem.ts` makes a signer from `EVM_PRIVATE_KEY`. `src/config.ts` builds `x402Client`, registers `ExactEvmScheme(signer)`, restricts spend via `setSpendControls({ allowedAssets })`, wraps Axios (`baseURL: PAYWALL_API_BASE_URL`) with `wrapAxiosWithPayment`. `src/index.ts` calls `api.get(PAYWALL_PATH)` then `httpClient.parsePaymentResult(...)` to check `settled` vs `settle_failed`.

## Flow
client requests paywalled route on server → server returns 402 w/ requirements from `x402Config` → client signs payment payload, retries → server forwards verify/settle to facilitator (`FACILITATOR_URL`) → facilitator checks/executes on-chain settlement via viem → server returns the actual resource.

## Conventions
- Chain IDs are always CAIP-2 (`eip155:<id>`): Base Sepolia = `eip155:84532`, Worldchain Sepolia = `eip155:4801`. Keep consistent across `x402Config`, `resourceServer.ts`, and facilitator `viem.ts` when adding a network.
- New paywalled route = add entry to `x402Config` + register any new chain in `resourceServer.ts`.
- New chain in facilitator = add `{chain, chainId}` pair + repeat `getViemClientForChain`/`getFacilitatorEvmSignerForChain` calls in `src/index.ts`.
