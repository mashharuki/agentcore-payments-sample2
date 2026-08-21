import "dotenv/config";
import { loadEnv, type McpServerEnv, mcpServerEnvSchema } from "shared";

// 環境変数をzodで検証する（Amazon Bedrock AgentCore Payments に接続するための設定一式）
export const env: McpServerEnv = loadEnv(mcpServerEnvSchema);
