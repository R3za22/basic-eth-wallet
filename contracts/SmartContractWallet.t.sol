// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {SmartContractWallet} from "./SmartContractWallet.sol";

interface Vm {
    function prank(address) external;
    function deal(address, uint256) external;
    function assume(bool) external pure;
}

/// @dev Native Hardhat 3 Solidity fuzz tests (no forge-std needed).
contract SmartContractWalletFuzzTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    SmartContractWallet private wallet;
    address private constant G1 = address(0xA1);
    address private constant G2 = address(0xA2);
    address private constant G3 = address(0xA3);

    receive() external payable {}

    function setUp() public {
        wallet = new SmartContractWallet(2);
        vm.deal(address(wallet), 1000 ether);
        wallet.setGuardian(G1, true);
        wallet.setGuardian(G2, true);
        wallet.setGuardian(G3, true);
    }

    function testFuzz_spenderNeverExceedsAllowance(address spender, uint96 limit, uint96 first, uint96 second) public {
        vm.assume(spender != address(0) && spender != address(this) && spender.code.length == 0 && uint160(spender) > 0xFFFF);
        wallet.setAllowance(spender, limit);
        uint256 before = address(wallet).balance;
        vm.prank(spender);
        try wallet.transfer(payable(address(0xBEEF)), first) {} catch {}
        vm.prank(spender);
        try wallet.transfer(payable(address(0xBEEF)), second) {} catch {}
        require(before - address(wallet).balance <= limit, "spent more than allowance");
    }

    function testFuzz_cancelClearsEveryApproval(address candidate) public {
        vm.assume(candidate != address(0) && candidate != address(this) && candidate != G1 && candidate != G2 && candidate != G3);
        vm.prank(G1);
        wallet.proposeNewOwner(candidate);
        wallet.cancelRecovery();
        require(wallet.recoveryVotes() == 0 && wallet.proposedOwner() == address(0), "state kept");
        require(!wallet.hasApproved(G1), "stale approval");
        // G1 and G2 can start from scratch: one vote alone does not hand over ownership
        vm.prank(G1);
        wallet.proposeNewOwner(candidate);
        require(wallet.owner() == address(this), "owner changed early");
    }

    function testFuzz_badNewOwnersAlwaysRejected(uint8 which) public {
        address bad = which % 3 == 0 ? address(0) : which % 3 == 1 ? address(this) : G2;
        vm.prank(G1);
        try wallet.proposeNewOwner(bad) {
            revert("accepted invalid owner");
        } catch {}
    }
}
