import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetWeatherTool } from "./tools/getWeather";

// MCPサーバー設定
export const mcpServer = new McpServer({
  name: "x402-weather-mcp-server",
  version: "1.0.0",
});

registerGetWeatherTool(mcpServer);
