import { type Address, type Chain } from "viem";
import { fuse, xdc } from "viem/chains";

export type ChainConfig = {
  name: string;
  chain: Chain;
  ubiScheme: Address;
  identity: Address;
  rpcUrl?: string;
};

export const chainConfigs: ChainConfig[] = [
  {
    name: "Fuse",
    chain: fuse,
    ubiScheme: "0xd253A5203817225e9768C05E5996d642fb96bA86",
    identity: "0xFa8d865A962ca8456dF331D78806152d3aC5B84F",
    rpcUrl: process.env.FUSE_RPC_URL?.trim() || undefined,
  },
  {
    name: "XDC",
    chain: xdc,
    ubiScheme: "0x22867567E2D80f2049200E25C6F31CB6Ec2F0faf",
    identity: "0x27a4a02C9ed591E1a86e2e5D05870292c34622C9",
    rpcUrl: process.env.XDC_RPC_URL?.trim() || undefined,
  },
];
