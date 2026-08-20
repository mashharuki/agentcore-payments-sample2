import { serve } from "@hono/node-server";
import { paymentMiddleware } from "@x402/hono";
import { Hono } from "hono";
import { x402Config } from "./config";
import { resourceServer } from "./resourceServer";

// Honoインスタンスの作成
const app = new Hono();

// x402ミドルウェアの設定
app.use(paymentMiddleware(x402Config, resourceServer));

// エンドポイントの設定
app.get("/health", (c) => {
  return c.json({
    report: {
      status: "OK",
    },
  });
});

app.get("/weather", (c) => {
  return c.json({
    report: {
      weather: "sunny",
      temperature: 70,
    },
  });
});

serve({ fetch: app.fetch, port: 4021 });
