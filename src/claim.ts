import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  zeroAddress,
  type Hex,
} from "viem";
import { identityAbi } from "./abis/identity.js";
import { ubiSchemeAbi } from "./abis/ubiScheme.js";
import { appendDataSuffix } from "./attribution.js";
import { account, getMinGasBalance } from "./config.js";
import { type ChainConfig } from "./chains.js";

export type ClaimResult = {
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

export async function claimOnChain(config: ChainConfig): Promise<ClaimResult> {
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
