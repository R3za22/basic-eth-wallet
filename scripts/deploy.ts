// Deploys SmartContractWallet. Defaults to the in-process Hardhat network (a dry run).
//   npx hardhat run scripts/deploy.ts                       # dry run
//   npx hardhat run scripts/deploy.ts --network sepolia     # needs SEPOLIA_RPC_URL + SEPOLIA_PRIVATE_KEY
import { network } from "hardhat";

const threshold = Number(process.env.GUARDIAN_THRESHOLD ?? "2");
if (!Number.isInteger(threshold) || threshold < 1) throw new Error("GUARDIAN_THRESHOLD must be a positive integer");

const { ethers } = await network.create();
const wallet = await ethers.deployContract("SmartContractWallet", [threshold]);
await wallet.waitForDeployment();
console.log(`SmartContractWallet deployed at ${await wallet.getAddress()} (threshold ${threshold})`);
