import { ExactEvmScheme } from "@x402/evm/exact/server";
import { x402ResourceServer } from "@x402/hono";
import { facilitatorClient } from "./facilitator";

// リソースサーバーの設定
export const resourceServer = new x402ResourceServer(facilitatorClient);
// EIP-155チェーンID84532のExactEvmSchemeを登録
resourceServer.register(
  "eip155:84532" as `${string}:${string}`,
  new ExactEvmScheme(),
);

// worldchain SepoliaのExactEvmSchemeを登録
resourceServer.register(
  "eip155:4801" as `${string}:${string}`,
  new ExactEvmScheme(),
);
