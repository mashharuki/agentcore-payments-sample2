import { evm, Mppx } from "mppx/client";
import { account } from "./viem";

// MPP用のクライアントインスタンスを生成
export const mppx = Mppx.create({
  methods: [
    // tempo({ account }),
    evm({
      account,
      authorization: {
        name: "USDC",
        version: "2",
      },
    }),
  ],
});
