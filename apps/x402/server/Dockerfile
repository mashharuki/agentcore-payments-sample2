# x402リソースサーバー（apps/x402/server）用のDockerイメージ。
# pnpmモノレポ全体（packages/shared 等のワークスペース依存を含む）をビルドコンテキストとして
# 受け取る前提のため、`docker build -f apps/x402/server/Dockerfile .`（リポジトリルート起点）で使う。
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile

WORKDIR /workspace/apps/x402/server
EXPOSE 4021

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
