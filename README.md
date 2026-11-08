# basic-eth-wallet

An ETH smart-contract wallet with spender allowances and guardian-based owner recovery. Solidity `0.8.35`, Hardhat 3, MIT licence.

## How it works

- **Owner** sends ETH freely, sets guardians, sets spender allowances, can cancel a recovery and can make arbitrary calls with `execute`.
- **Spenders** can only call `transfer(to, amount)`: plain ETH, up to their remaining allowance. They cannot attach calldata, call other contracts or touch tokens.
- **Guardians** vote with `proposeNewOwner(newOwner)`. When `threshold` distinct guardians approve the same candidate, ownership moves.
  - The candidate cannot be the zero address, the current owner, the wallet itself or a guardian.
  - A different candidate starts a fresh round, so earlier approvals are dropped.
  - Finishing or cancelling a recovery starts a new round: no approval is ever carried over.
  - Removing a guardian discards their pending approval.
- Allowances survive an ownership change; the new owner should review them.

All state changes emit events (`Deposited`, `Sent`, `Executed`, `GuardianSet`, `ThresholdSet`, `AllowanceSet`, `RecoveryProposed`, `RecoveryApproved`, `RecoveryCancelled`, `OwnerChanged`).

## Develop

```bash
npm install            # on drives that block symlinks: npm install --no-bin-links
npm test               # Hardhat: scenario tests, direct tests, seeded randomised model tests, Solidity fuzz tests
npm run lint           # solhint
npm run deploy:dry     # deploys to the in-process network only
```

Tests: `test/SmartContractWallet.test.ts` runs the scenarios in `parity/wallet-scenarios.json` (shared with the TypeScript port used by the
ShahContract demo), plus a seeded random model check. `contracts/SmartContractWallet.t.sol` holds native Hardhat Solidity fuzz tests.

## Sepolia

Nothing is deployed from this repository. To deploy yourself, export `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` (never commit them), then
`npm run deploy:sepolia`. `GUARDIAN_THRESHOLD` (default 2) sets the approvals needed.

## Status

Not externally audited; do not use with real funds. Static analysis: solhint (clean). Slither was not available when this was written.

## Licence

MIT, see `LICENSE`.
