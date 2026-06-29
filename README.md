# Autoclaimer

A small Node + TypeScript cron job that claims [GoodDollar](https://gooddollar.org) UBI for a single
account via **direct EOA transactions** on the **Fuse** and **XDC** networks.

On each run it iterates both chains, checks eligibility, and submits a `claim()` transaction where
the account is eligible. It is designed to run once per invocation and exit, which fits a scheduled
GitHub Actions workflow.

## How it works

For each chain (Fuse, then XDC) the job:

1. Reads `getWhitelistedRoot(eoa)` from the GoodDollar Identity contract.
2. Skips if the address is not whitelisted.
3. Reads `hasClaimed(root)` and `checkEntitlement(root)` from the UBIScheme contract.
4. Skips if already claimed today or if there is no entitlement.
5. Verifies the EOA holds enough native gas (FUSE / XDC).
6. Sends a direct `claim()` transaction (with a `THECLAIMER` attribution calldata suffix) and waits
   for the receipt.

A failure on one chain does not block the other; results are summarized at the end.

## Contracts

| Network | UBIScheme | Identity |
| --- | --- | --- |
| Fuse | `0xd253A5203817225e9768C05E5996d642fb96bA86` | `0xFa8d865A962ca8456dF331D78806152d3aC5B84F` |
| XDC | `0x22867567E2D80f2049200E25C6F31CB6Ec2F0faf` | `0x27a4a02C9ed591E1a86e2e5D05870292c34622C9` |

Addresses from the [GoodDollar core contracts](https://docs.gooddollar.org/for-developers/core-contracts).

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set PRIVATE_KEY
npm run dev      # run once locally
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `PRIVATE_KEY` | yes | EOA private key (with or without `0x`). Must be the whitelisted GoodDollar identity on both chains. |
| `FUSE_RPC_URL` | no | RPC override for Fuse. Falls back to viem's default. |
| `XDC_RPC_URL` | no | RPC override for XDC. Falls back to viem's default. |
| `MIN_GAS_BALANCE` | no | Minimum native balance (in ether units) required to attempt a claim. Default `0.01`. |

### Gas funding

This sends **direct transactions**, so the EOA pays its own gas. Keep a small balance of native
**FUSE** and native **XDC** in the account. If the balance is below `MIN_GAS_BALANCE`, the claim for
that chain is skipped with a warning rather than failing the whole run.

## Deploy with GitHub Actions

The job runs on a schedule via [`.github/workflows/claim.yml`](.github/workflows/claim.yml) (daily at
`0 12 * * *` UTC, plus a manual `workflow_dispatch` trigger).

1. Push this repo to GitHub.
2. Add the EOA key as an Actions **secret**: repo Settings -> Secrets and variables -> Actions ->
   New repository secret -> `PRIVATE_KEY`.
3. Optionally add `FUSE_RPC_URL` / `XDC_RPC_URL` as secrets, and `MIN_GAS_BALANCE` as a repository
   **variable**, if you want to override the defaults.
4. Trigger a test run from the **Actions** tab (Run workflow) to confirm it works; after that it runs
   automatically every day at 12:00 UTC.

Notes:
- Scheduled runs may be delayed a few minutes during peak load, which is fine for a daily claim.
- GitHub disables scheduled workflows after 60 days of repo inactivity; any push re-enables them.
