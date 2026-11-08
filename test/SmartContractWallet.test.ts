import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.create();
const { scenarios } = JSON.parse(readFileSync("parity/wallet-scenarios.json", "utf8"));
const NAMES = ["owner", "g1", "g2", "g3", "g4", "alice", "bob", "newOwner", "newOwner2"];
const ZERO = ethers.ZeroAddress;

async function setup(threshold = 2) {
  const signers = await ethers.getSigners();
  const who: Record<string, any> = {};
  NAMES.forEach((n, i) => (who[n] = signers[i]));
  const wallet = await ethers.deployContract("SmartContractWallet", [threshold], who.owner);
  return { who, wallet };
}
const failsWith = (name: string) => (e: any) => String(e.message + (e.shortMessage ?? "")).includes(name);

describe("SmartContractWallet (shared parity scenarios)", () => {
  for (const sc of scenarios) {
    it(sc.name, async () => {
      const { who, wallet } = await setup(sc.threshold ?? 2);
      const addr = (n: string) => (n === "zero" ? ZERO : who[n].address);
      for (const s of sc.steps) {
        const w = wallet.connect(who[s.as]) as any;
        const a = s.args;
        const send = async () => {
          switch (s.call) {
            case "fund": return who[s.as].sendTransaction({ to: await wallet.getAddress(), value: a[0] });
            case "setAllowance": return w.setAllowance(addr(a[0]), a[1]);
            case "setGuardian": return w.setGuardian(addr(a[0]), a[1]);
            case "setThreshold": return w.setThreshold(a[0]);
            case "transfer": return w.transfer(addr(a[0]), a[1]);
            case "proposeNewOwner": return w.proposeNewOwner(addr(a[0]));
            case "cancelRecovery": return w.cancelRecovery();
          }
          throw new Error("unknown call " + s.call);
        };
        if (s.revert) await assert.rejects(async () => (await send()).wait?.(), failsWith(s.revert));
        else await (await send()).wait();
      }
      const ex = sc.expect ?? {};
      if (ex.owner) assert.equal(await wallet.owner(), who[ex.owner].address);
      if (ex.balance !== undefined) assert.equal(await wallet.getBalance(), BigInt(ex.balance));
      if (ex.votes !== undefined) assert.equal(await wallet.recoveryVotes(), BigInt(ex.votes));
      if (ex.threshold !== undefined) assert.equal(await wallet.threshold(), BigInt(ex.threshold));
      if (ex.proposed !== undefined) assert.equal(await wallet.proposedOwner(), ex.proposed === null ? ZERO : who[ex.proposed].address);
      for (const [n, v] of Object.entries(ex.allowance ?? {})) assert.equal(await wallet.allowance(who[n].address), BigInt(v as number));
    });
  }
});

describe("SmartContractWallet (direct)", () => {
  it("rejects a zero threshold at deploy", async () => {
    await assert.rejects(() => ethers.deployContract("SmartContractWallet", [0]), failsWith("InvalidThreshold"));
  });

  it("emits events for the full recovery lifecycle", async () => {
    const { who, wallet } = await setup(2);
    await (await wallet.setGuardian(who.g1.address, true)).wait();
    await (await wallet.setGuardian(who.g2.address, true)).wait();
    const w1: any = wallet.connect(who.g1);
    const w2: any = wallet.connect(who.g2);
    await assert.doesNotReject(async () => {
      const tx = await w1.proposeNewOwner(who.newOwner.address);
      const r = await tx.wait();
      const names = r.logs.map((l: any) => wallet.interface.parseLog(l)?.name);
      assert.deepEqual(names, ["RecoveryProposed", "RecoveryApproved"]);
    });
    const r2 = await (await w2.proposeNewOwner(who.newOwner.address)).wait();
    const names = r2.logs.map((l: any) => wallet.interface.parseLog(l)?.name);
    assert.deepEqual(names, ["RecoveryApproved", "OwnerChanged"]);
  });

  it("emits Deposited, AllowanceSet and Sent", async () => {
    const { who, wallet } = await setup();
    const addr = await wallet.getAddress();
    const dep = await (await who.owner.sendTransaction({ to: addr, value: 100n })).wait();
    assert.equal(wallet.interface.parseLog(dep.logs[0])?.name, "Deposited");
    const al = await (await wallet.setAllowance(who.alice.address, 10n)).wait();
    assert.equal(wallet.interface.parseLog(al.logs[0])?.name, "AllowanceSet");
    const sent = await (await (wallet.connect(who.alice) as any).transfer(who.bob.address, 4n)).wait();
    assert.equal(wallet.interface.parseLog(sent.logs[0])?.name, "Sent");
  });

  it("spenders have no way to attach calldata", async () => {
    const { wallet } = await setup();
    const transfer = wallet.interface.getFunction("transfer")!;
    assert.deepEqual(transfer.inputs.map((i) => i.type), ["address", "uint256"]);
    const execute = wallet.interface.getFunction("execute")!;
    assert.equal(execute.stateMutability, "nonpayable");
  });

  it("only the owner can execute arbitrary calls", async () => {
    const { who, wallet } = await setup();
    const target = await ethers.deployContract("RejectsEther");
    const data = target.interface.encodeFunctionData("deposit");
    await who.owner.sendTransaction({ to: await wallet.getAddress(), value: 10n });
    await (await wallet.setAllowance(who.alice.address, 10n)).wait();
    const tAddr = await target.getAddress();
    await assert.rejects(() => (wallet.connect(who.alice) as any).execute(tAddr, 0n, data), failsWith("NotOwner"));
    await (await wallet.execute(await target.getAddress(), 3n, data)).wait();
    assert.equal(await target.deposited(), 3n);
  });

  it("a spender cannot reach a payable function of a contract that refuses plain ETH", async () => {
    const { who, wallet } = await setup();
    const target = await ethers.deployContract("RejectsEther");
    await who.owner.sendTransaction({ to: await wallet.getAddress(), value: 10n });
    await (await wallet.setAllowance(who.alice.address, 10n)).wait();
    await assert.rejects(async () => (await (wallet.connect(who.alice) as any).transfer(await target.getAddress(), 1n)).wait(), failsWith("TransferFailed"));
    assert.equal(await wallet.allowance(who.alice.address), 10n);
  });

  it("transfer to the zero address is rejected", async () => {
    const { wallet } = await setup();
    await assert.rejects(() => wallet.transfer(ZERO, 0n), failsWith("ZeroAddress"));
  });

  it("recovery clears votes so a new round starts empty", async () => {
    const { who, wallet } = await setup(2);
    for (const g of ["g1", "g2", "g3"]) await (await wallet.setGuardian(who[g].address, true)).wait();
    await (await (wallet.connect(who.g1) as any).proposeNewOwner(who.newOwner.address)).wait();
    await (await (wallet.connect(who.g2) as any).proposeNewOwner(who.newOwner.address)).wait();
    assert.equal(await wallet.recoveryVotes(), 0n);
    assert.equal(await wallet.hasApproved(who.g1.address), false);
    // new owner can later be replaced again by the same guardians (no stale "already voted")
    await (await (wallet.connect(who.g1) as any).proposeNewOwner(who.newOwner2.address)).wait();
    await (await (wallet.connect(who.g2) as any).proposeNewOwner(who.newOwner2.address)).wait();
    assert.equal(await wallet.owner(), who.newOwner2.address);
  });
});

// ---- randomised property tests: the contract is checked against a tiny model ----
function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe("SmartContractWallet (randomised properties)", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`model matches contract over 60 random actions (seed ${seed})`, async () => {
      const rnd = prng(seed);
      const pick = (xs: string[]): string => xs[Math.floor(rnd() * xs.length)];
      const { who, wallet } = await setup(2);
      const walletAddr = await wallet.getAddress();
      const people = ["owner", "g1", "g2", "g3", "g4", "alice", "bob", "newOwner", "newOwner2"];
      const m = { owner: "owner", guardians: new Set<string>(), allowance: new Map<string, bigint>(), proposed: null as string | null, voted: new Set<string>(), balance: 0n, threshold: 2 };
      const ok = async (p: Promise<any>) => { try { await (await p).wait(); return true; } catch { return false; } };
      for (let i = 0; i < 60; i++) {
        const actor = pick(people);
        const c = wallet.connect(who[actor]) as any;
        const target = pick(people);
        const amt = BigInt(Math.floor(rnd() * 50));
        switch (pick(["fund", "guardian", "allow", "send", "propose", "cancel"])) {
          case "fund": {
            await who[actor].sendTransaction({ to: walletAddr, value: amt }); m.balance += amt; break;
          }
          case "guardian": {
            const on = rnd() < 0.7;
            const success = await ok(c.setGuardian(who[target].address, on));
            if (success) {
              assert.equal(actor, m.owner);
              if (on) m.guardians.add(target);
              else { m.guardians.delete(target); m.voted.delete(target); }
            } else assert.notEqual(actor, m.owner);
            break;
          }
          case "allow": {
            if (await ok(c.setAllowance(who[target].address, amt))) m.allowance.set(target, amt);
            break;
          }
          case "send": {
            const left = m.allowance.get(actor) ?? 0n;
            const expectOk = actor === m.owner ? amt <= m.balance : left > 0n && left >= amt && amt <= m.balance;
            const success = await ok(c.transfer(who[target].address, amt));
            assert.equal(success, expectOk, `send by ${actor}`);
            if (success) { m.balance -= amt; if (actor !== m.owner) m.allowance.set(actor, left - amt); }
            break;
          }
          case "propose": {
            const invalid = target === m.owner || m.guardians.has(target);
            const expectOk = m.guardians.has(actor) && !invalid && !(m.proposed === target && m.voted.has(actor));
            const success = await ok(c.proposeNewOwner(who[target].address));
            assert.equal(success, expectOk, `propose ${target} by ${actor}`);
            if (success) {
              if (m.proposed !== target) { m.proposed = target; m.voted = new Set(); }
              m.voted.add(actor);
              if (m.voted.size >= m.threshold) { m.owner = target; m.proposed = null; m.voted = new Set(); }
            }
            break;
          }
          case "cancel": {
            const success = await ok(c.cancelRecovery());
            assert.equal(success, actor === m.owner && m.proposed !== null);
            if (success) { m.proposed = null; m.voted = new Set(); }
            break;
          }
        }
        // invariants after every step
        assert.equal(await wallet.owner(), who[m.owner].address);
        assert.notEqual(await wallet.owner(), ZERO);
        assert.equal(await wallet.getBalance(), m.balance);
        assert.equal(await wallet.recoveryVotes(), BigInt(m.voted.size));
        assert.ok((await wallet.recoveryVotes()) < (await wallet.threshold()));
        assert.equal(await wallet.guardianCount(), BigInt(m.guardians.size));
        if (m.proposed === null) assert.equal(await wallet.proposedOwner(), ZERO);
      }
    });
  }
});
