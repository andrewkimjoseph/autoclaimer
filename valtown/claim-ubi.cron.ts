/**
 * Val Town cron val — paste this into a new CRON file at val.town.
 *
 * Setup:
 * 1. Create a new val at https://www.val.town
 * 2. Click + → CRON
 * 3. Paste this file's contents
 * 4. Left sidebar → Environment variables → add PRIVATE_KEY (required)
 * 5. Optional: FUSE_RPC_URL, XDC_RPC_URL, MIN_GAS_BALANCE (default 0.01)
 * 6. Click Run to test, then set schedule to cron "0 12 * * *" (daily 12:00 UTC)
 */
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseEther,
  stringToHex,
  zeroAddress,
  type Address,
  type Chain,
  type Hex,
} from "npm:viem@2.26.2";
import { privateKeyToAccount } from "npm:viem@2.26.2/accounts";
import { fuse, xdc } from "npm:viem@2.26.2/chains";

const identityAbi = [
  {
    name: "getWhitelistedRoot",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "whitelisted", type: "address" }],
  },
] as const;

const ubiSchemeAbi = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "hasClaimed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_member", type: "address" }],
    name: "checkEntitlement",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claim",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ANDI_DATA_SUFFIX = stringToHex("ANDI");

function appendDataSuffix(data: Hex): Hex {
  return concat([data, ANDI_DATA_SUFFIX]);
}

type ChainConfig = {
  name: string;
  chain: Chain;
  ubiScheme: Address;
  identity: Address;
  rpcUrl?: string;
};

type ClaimResult = {
  chain: string;
  eoaAddress: Hex;
} & (
  | { status: "claimed"; whitelistedRoot: Hex; entitlement: string; transactionHash: Hex }
  | { status: "already_claimed"; whitelistedRoot: Hex }
  | { status: "not_whitelisted" }
  | { status: "no_entitlement"; whitelistedRoot: Hex }
  | { status: "insufficient_gas"; balance: string; required: string }
  | { status: "error"; message: string }
);

function env(name: string): string | undefined {
  const value = Deno.env.get(name) ?? process.env[name];
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function getPrivateKey(): Hex {
  const raw = env("PRIVATE_KEY");
  if (!raw) {
    throw new Error("Missing PRIVATE_KEY environment variable");
  }
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function getMinGasBalance(): bigint {
  const raw = env("MIN_GAS_BALANCE");
  return parseEther(raw ?? "0.01");
}

function getChainConfigs(): ChainConfig[] {
  return [
    {
      name: "Fuse",
      chain: fuse,
      ubiScheme: "0xd253A5203817225e9768C05E5996d642fb96bA86",
      identity: "0xFa8d865A962ca8456dF331D78806152d3aC5B84F",
      rpcUrl: env("FUSE_RPC_URL"),
    },
    {
      name: "XDC",
      chain: xdc,
      ubiScheme: "0x22867567E2D80f2049200E25C6F31CB6Ec2F0faf",
      identity: "0x27a4a02C9ed591E1a86e2e5D05870292c34622C9",
      rpcUrl: env("XDC_RPC_URL"),
    },
  ];
}

async function claimOnChain(
  config: ChainConfig,
  account: ReturnType<typeof privateKeyToAccount>
): Promise<ClaimResult> {
  const eoaAddress = account.address;

  try {
    const publicClient = createPublicClient({
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    const whitelistedRoot = await publicClient.readContract({
      address: config.identity,
      abi: identityAbi,
      functionName: "getWhitelistedRoot",
      args: [eoaAddress],
    });

    if (whitelistedRoot === zeroAddress) {
      return { chain: config.name, eoaAddress, status: "not_whitelisted" };
    }

    const [hasClaimedResult, entitlementResult] = await publicClient.multicall({
      contracts: [
        {
          address: config.ubiScheme,
          abi: ubiSchemeAbi,
          functionName: "hasClaimed",
          args: [whitelistedRoot],
        },
        {
          address: config.ubiScheme,
          abi: ubiSchemeAbi,
          functionName: "checkEntitlement",
          args: [whitelistedRoot],
        },
      ],
    });

    if (hasClaimedResult.status !== "success") {
      throw new Error("Failed to read hasClaimed from UBI scheme");
    }

    if (hasClaimedResult.result) {
      return {
        chain: config.name,
        eoaAddress,
        status: "already_claimed",
        whitelistedRoot,
      };
    }

    if (entitlementResult.status !== "success") {
      throw new Error("Failed to read checkEntitlement from UBI scheme");
    }

    const entitlement = entitlementResult.result;

    if (entitlement === BigInt(0)) {
      return {
        chain: config.name,
        eoaAddress,
        status: "no_entitlement",
        whitelistedRoot,
      };
    }

    const balance = await publicClient.getBalance({ address: eoaAddress });
    const minGasBalance = getMinGasBalance();

    if (balance < minGasBalance) {
      return {
        chain: config.name,
        eoaAddress,
        status: "insufficient_gas",
        balance: formatEther(balance),
        required: formatEther(minGasBalance),
      };
    }

    const walletClient = createWalletClient({
      account,
      chain: config.chain,
      transport: http(config.rpcUrl),
    });

    const claimData = encodeFunctionData({
      abi: ubiSchemeAbi,
      functionName: "claim",
      args: [],
    });

    const transactionHash = await walletClient.sendTransaction({
      to: config.ubiScheme,
      value: BigInt(0),
      data: appendDataSuffix(claimData),
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
    });

    if (receipt.status !== "success") {
      throw new Error(`Claim transaction reverted (${transactionHash})`);
    }

    return {
      chain: config.name,
      eoaAddress,
      status: "claimed",
      whitelistedRoot,
      entitlement: formatUnits(entitlement, 18),
      transactionHash,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { chain: config.name, eoaAddress, status: "error", message };
  }
}

function describe(result: ClaimResult): string {
  switch (result.status) {
    case "claimed":
      return `claimed ${result.entitlement} G$ (tx ${result.transactionHash})`;
    case "already_claimed":
      return "already claimed today";
    case "not_whitelisted":
      return "not a whitelisted GoodDollar identity — skipped";
    case "no_entitlement":
      return "no entitlement right now — skipped";
    case "insufficient_gas":
      return `insufficient gas: balance ${result.balance}, need >= ${result.required} — skipped`;
    case "error":
      return `error: ${result.message}`;
  }
}

export default async function (_interval: Interval) {
  try {
    console.log(`Autoclaimer run at ${new Date().toISOString()}`);

    const account = privateKeyToAccount(getPrivateKey());
    console.log(`EOA address: ${account.address}`);

    const results: ClaimResult[] = [];

    for (const config of getChainConfigs()) {
      console.log(`[${config.name}] starting...`);
      const result = await claimOnChain(config, account);
      results.push(result);
      console.log(`[${config.name}] ${describe(result)}`);
    }

    console.log("Summary:");
    for (const result of results) {
      console.log(`  ${result.chain}: ${result.status}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fatal error: ${message}`);
    throw error;
  }
}
