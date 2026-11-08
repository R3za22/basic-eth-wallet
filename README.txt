# Basic ETH Wallet

A minimal multi-signature style Ethereum smart contract wallet with guardian-based ownership recovery and spending allowances.

## Features

- **Owner Controls**: Only the owner can set allowances and manage guardians
- **Spending Allowances**: Authorized addresses can spend up to specified limits
- **Guardian System**: Trusted guardians can vote to transfer ownership
- **Multi-Signature Recovery**: Requires 3 guardian confirmations to change owner
- **Flexible Transfers**: Send ETH with custom calldata payloads

## Smart Contract Details

- **Solidity Version**: 0.8.35
- **License**: MIT

## Key Functions

### Owner Functions
- `setGuardian(address _guardian, bool _isGuardian)` - Add or remove guardians
- `setAllowance(address _for, uint _amount)` - Set spending limits for addresses

### Guardian Functions
- `proposeNewOwner(address payable _newOwner)` - Vote to change wallet owner (requires 3 confirmations)

### User Functions
- `transfer(address payable _to, uint _amount, bytes memory _payload)` - Send ETH with optional data

### View Functions
- `getBalance()` - Check contract balance
- `allowance(address)` - Check spending limit for an address

## Security Notes

- Uses `call()` instead of deprecated `transfer()` for ETH transfers
- Implements guardian-based recovery (no single point of failure)
- Spending allowances prevent unauthorized withdrawals

## Deployment

```bash
# Deploy with Remix or Hardhat
Contract: SmartContractWallet
Network: Any EVM-compatible chain

## Tests

```bash
npm install
npm test   # Hardhat 3 + mocha, solc 0.8.35
```

`parity/wallet-scenarios.json` holds shared scenarios. The same file is run against the
TypeScript port used by the in-browser demo in R3za22/ShahContract, so the demo and the
Solidity contract stay in agreement.
