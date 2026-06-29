import { config } from "dotenv";
import { parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

config();

export function getPrivateKey(): Hex {
  const raw = process.env.PRIVATE_KEY?.trim();

  if (!raw) {
    throw new Error("Missing PRIVATE_KEY in environment");
  }

  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export const account = privateKeyToAccount(getPrivateKey());

/** Minimum native gas balance required before attempting a claim (in wei). */
export function getMinGasBalance(): bigint {
  const raw = process.env.MIN_GAS_BALANCE?.trim();
  return parseEther(raw && raw.length > 0 ? raw : "0.01");
}
