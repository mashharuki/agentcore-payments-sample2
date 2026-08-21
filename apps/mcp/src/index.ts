import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";

// Honoインスタンスを生成
const app = new Hono();

// MCPサーバー設定
const server = new McpServer({ name: "simple-mcp-server", version: "1.0.0" });

export default app;
