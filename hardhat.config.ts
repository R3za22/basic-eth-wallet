import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

// Secrets are read lazily from the environment (or the Hardhat keystore) and never stored in this repo.
//   SEPOLIA_RPC_URL=...  SEPOLIA_PRIVATE_KEY=...  npx hardhat run scripts/deploy.ts --network sepolia
export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: { version: "0.8.35" },
  paths: { artifacts: "./hh-artifacts", cache: "./hh-cache", sources: "./contracts", tests: { mocha: "./test" } },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
