// x402に関する設定
export const x402Config = {
  "GET /weather": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: "eip155:84532" as `${string}:${string}`, // Base Sepolia
        payTo: process.env.EVM_ADDRESS as `0x${string}`,
      },
    ],
    description: "Weather data",
    mimeType: "application/json",
  },
};
