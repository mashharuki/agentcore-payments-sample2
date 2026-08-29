#!/usr/bin/env tsx
/**
 * apps/mcp のMCPサーバー（Streamable HTTP）に接続し、get_weather ツールを1回呼び出す簡易クライアント。
 * サーバー・facilitator・MCPサーバーを起動した状態で `pnpm --filter mcp call` で実行する。
 *
 *   MCP_URL       接続先（既定: http://localhost:4024/mcp）
 *   WEATHER_CITY  get_weather に渡す都市名（既定: Tokyo）
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:4024/mcp";
const CITY = process.env.WEATHER_CITY ?? "Tokyo";

const main = async (): Promise<void> => {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "mcp-call-get-weather", version: "1.0.0" });

  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    console.log("利用可能なツール:", tools.map((t) => t.name).join(", "));

    console.log(`\nget_weather を呼び出します（city: ${CITY}）...`);
    const result = await client.callTool({
      name: "get_weather",
      arguments: { city: CITY },
    });

    for (const part of result.content as Array<{
      type: string;
      text?: string;
    }>) {
      if (part.type === "text" && part.text) {
        console.log("\n結果:", part.text);
      }
    }
    if (result.isError) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
};

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
