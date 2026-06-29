import { concat, stringToHex, type Hex } from "viem";

/** Calldata suffix appended to prepared transactions for on-chain attribution. */
export const ANDI_DATA_SUFFIX = stringToHex("ANDI");

export function appendDataSuffix(
  data: Hex,
  suffix: Hex = ANDI_DATA_SUFFIX
): Hex {
  return concat([data, suffix]);
}
