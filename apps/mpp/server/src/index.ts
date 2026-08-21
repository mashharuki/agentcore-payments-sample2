import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { discovery } from "mppx/hono";
import { mppx } from "./config";

// Honoのインスタンスを作成
const app = new Hono();

// HonoのルートにMppxハンドラーを登録
app.get("/health", (c) => c.json({ status: "OK" }));

app.get("/resource", mppx.charge({ amount: "0.1" }), (c) =>
  c.json({ data: "テスト" }),
);

// 足し算
app.get("/add", mppx.charge({ amount: "0.2" }), (c) => {
  const result = 2 + 3;

  return c.json({
    result: result.toString(),
  });
});

// ディスカバーリーエンドポイントを追加
discovery(app, mppx, {
  auto: true,
  info: { title: "My Sample MPP API", version: "1.0.0" },
});

// サーバー起動
serve({ fetch: app.fetch, port: 4023 });
