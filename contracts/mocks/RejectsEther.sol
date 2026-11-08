// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @dev Test helper: refuses plain ETH, accepts it through `deposit`.
contract RejectsEther {
    uint256 public deposited;

    function deposit() external payable {
        deposited += msg.value;
    }
}
