export const identityAbi = [
  {
    name: "getWhitelistedRoot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "whitelisted", type: "address" }],
  },
] as const;
