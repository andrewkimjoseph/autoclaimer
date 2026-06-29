import { chainConfigs } from "./chains.js";
import { claimOnChain, type ClaimResult } from "./claim.js";
import { account } from "./config.js";

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

async function main(): Promise<void> {
  console.log(`Autoclaimer run at ${new Date().toISOString()}`);
  console.log(`EOA address: ${account.address}`);

  const results: ClaimResult[] = [];

  for (const config of chainConfigs) {
    console.log(`\n[${config.name}] starting...`);
    const result = await claimOnChain(config);
    results.push(result);
    console.log(`[${config.name}] ${describe(result)}`);
  }

  console.log("\nSummary:");
  for (const result of results) {
    console.log(`  ${result.chain}: ${result.status}`);
  }

  const hadError = results.some((result) => result.status === "error");
  process.exit(hadError ? 1 : 0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
