import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.create();
const { scenarios } = JSON.parse(readFileSync("parity/wallet-scenarios.json", "utf8"));
const NAMES = ["owner", "g1", "g2", "g3", "g4", "alice", "bob", "newOwner", "newOwner2"];

describe("SmartContractWallet (shared parity scenarios)", () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      const signers = await ethers.getSigners();
      const who: Record<string, any> = {};
      NAMES.forEach((n, i) => (who[n] = signers[i]));
      const wallet = await ethers.deployContract("SmartContractWallet", [], who.owner);
      for (const s of sc.steps) {
        const w = wallet.connect(who[s.as]) as any;
        const send = async () => {
          const a = s.args;
          switch (s.call) {
            case "fund": return who[s.as].sendTransaction({ to: await wallet.getAddress(), value: a[0] });
            case "setAllowance": return w.setAllowance(who[a[0]].address, a[1]);
            case "setGuardian": return w.setGuardian(who[a[0]].address, a[1]);
            case "transfer": return w.transfer(who[a[0]].address, a[1], "0x");
            case "proposeNewOwner": return w.proposeNewOwner(who[a[0]].address);
          }
          throw new Error("unknown call " + s.call);
        };
        if (s.revert) {
          await assert.rejects(async () => (await send()).wait?.(), (e: any) =>
            String(e.message + (e.shortMessage ?? "")).includes(s.revert));
        } else {
          await (await send()).wait();
        }
      }
      const ex = sc.expect ?? {};
      if (ex.owner) assert.equal(await wallet.owner(), who[ex.owner].address);
      if (ex.balance !== undefined) assert.equal(await wallet.getBalance(), BigInt(ex.balance));
      for (const [n, v] of Object.entries(ex.allowance ?? {}))
        assert.equal(await wallet.allowance(who[n].address), BigInt(v as number));
    });
  }

  it("exposes the 3-guardian threshold", async () => {
    const wallet = await ethers.deployContract("SmartContractWallet");
    assert.equal(await wallet.confirmationsFromGuardiansForReset(), 3n);
  });
});
