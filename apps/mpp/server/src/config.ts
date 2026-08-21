import "dotenv/config";
import { evm, Mppx, tempo } from "mppx/hono";

// MPPのインスタンスを作成
export const mppx = Mppx.create({
  methods: [
    tempo.charge({
      currency: "0x20c0000000000000000000000000000000000000",
      recipient: process.env.EVM_ADDRESS!,
      testnet: true,
    }),
    evm.charge({
      currency: evm.assets.baseSepolia.USDC,
      chainId: 84532,
      recipient: process.env.EVM_ADDRESS!,
      x402: {
        facilitator: process.env.FACILITATOR_URL!,
      },
    }),
  ],
  secretKey: process.env.MPP_SECRET_KEY!,
});
