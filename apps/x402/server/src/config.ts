import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import "dotenv/config";
import { loadEnv, resourceServerEnvSchema } from "shared";

// 環境変数をzodで検証（不正な設定であれば起動時に即座に失敗させる）
export const env = loadEnv(resourceServerEnvSchema);

// x402に関する設定（対応ネットワークはBase Sepoliaのみ）
export const x402Config = {
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532" as `${string}:${string}`, // Base Sepolia
        payTo: env.EVM_ADDRESS as `0x${string}`,
      },
    ],
    description:
      "Get real-time weather data including temperature, conditions, and humidity",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        input: { city: "San Francisco" },
        inputSchema: {
          properties: { city: { type: "string", description: "City name" } },
          required: ["city"],
        },
      }),
    },
  },
};
