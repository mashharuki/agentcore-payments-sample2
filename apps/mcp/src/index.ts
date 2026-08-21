import { StreamableHTTPTransport } from "@hono/mcp";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./config";
import { mcpServer } from "./server";

// Honoインスタンスを生成
const app = new Hono();

// ヘルスチェック用エンドポイント（認証不要、ECSのヘルスチェックから利用する）
app.get("/health", (c) => c.json({ status: "OK" }));

// MCPのStreamable HTTP Transportを配線する
const transport = new StreamableHTTPTransport();

app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`MCP server listening on http://localhost:${info.port}/mcp`);
});
