import "dotenv/config";
import { loadEnv, type X402ClientEnv, x402ClientEnvSchema } from "shared";

// 環境変数をzodで検証する（Amazon Bedrock AgentCore Payments に接続するための設定一式）
export const env: X402ClientEnv = loadEnv(x402ClientEnvSchema);
