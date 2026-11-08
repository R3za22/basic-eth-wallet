// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @title SmartContractWallet
/// @notice An ETH wallet with spender allowances and guardian-based owner recovery.
/// @dev Spenders can only send plain ETH (no calldata). Only the owner can call other contracts, via `execute`.
///      Recovery votes belong to a `round`; finishing or cancelling a recovery starts a new round, so no
///      vote can ever be carried over into a later proposal.
contract SmartContractWallet {
    address public owner;
    /// @notice Guardian approvals needed to replace the owner.
    uint256 public threshold;
    uint256 public guardianCount;

    mapping(address => bool) public guardians;
    /// @notice Remaining ETH (wei) a spender may still send.
    mapping(address => uint256) public allowance;

    address public proposedOwner;
    uint256 public recoveryRound;
    uint256 public recoveryVotes;
    mapping(uint256 => mapping(address => bool)) private _voted;

    event Deposited(address indexed from, uint256 amount);
    event Sent(address indexed by, address indexed to, uint256 amount);
    event Executed(address indexed to, uint256 amount, bytes data);
    event GuardianSet(address indexed guardian, bool isGuardian);
    event ThresholdSet(uint256 threshold);
    event AllowanceSet(address indexed spender, uint256 amount);
    event RecoveryProposed(address indexed proposer, address indexed newOwner, uint256 round);
    event RecoveryApproved(address indexed guardian, address indexed newOwner, uint256 votes);
    event RecoveryCancelled(address indexed by, address indexed newOwner);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotGuardian();
    error AlreadyVoted();
    error InvalidNewOwner();
    error InvalidThreshold();
    error NotAllowed();
    error ExceedsAllowance();
    error TransferFailed();
    error ZeroAddress();
    error NoRecovery();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 threshold_) {
        if (threshold_ == 0) revert InvalidThreshold();
        owner = msg.sender;
        threshold = threshold_;
        emit ThresholdSet(threshold_);
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ---- owner administration ----

    function setGuardian(address guardian, bool isGuardian) external onlyOwner {
        if (guardian == address(0)) revert ZeroAddress();
        if (guardians[guardian] == isGuardian) return;
        guardians[guardian] = isGuardian;
        if (isGuardian) {
            guardianCount++;
        } else {
            guardianCount--;
            // A removed guardian's pending approval must not count any more.
            if (_voted[recoveryRound][guardian]) {
                _voted[recoveryRound][guardian] = false;
                recoveryVotes--;
            }
        }
        emit GuardianSet(guardian, isGuardian);
    }

    function setThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0 || newThreshold > guardianCount) revert InvalidThreshold();
        threshold = newThreshold;
        emit ThresholdSet(newThreshold);
    }

    function setAllowance(address spender, uint256 amount) external onlyOwner {
        allowance[spender] = amount;
        emit AllowanceSet(spender, amount);
    }

    // ---- spending ----

    /// @notice Send plain ETH. The owner is unlimited; anyone else spends down their allowance.
    function transfer(address payable to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != owner) {
            uint256 left = allowance[msg.sender];
            if (left == 0) revert NotAllowed();
            if (left < amount) revert ExceedsAllowance();
            allowance[msg.sender] = left - amount;
        }
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Sent(msg.sender, to, amount);
    }

    /// @notice Owner-only arbitrary call, for talking to other contracts.
    function execute(address to, uint256 amount, bytes calldata data) external onlyOwner returns (bytes memory result) {
        if (to == address(0)) revert ZeroAddress();
        bool ok;
        (ok, result) = to.call{value: amount}(data);
        if (!ok) revert TransferFailed();
        emit Executed(to, amount, data);
    }

    // ---- guardian recovery ----

    function proposeNewOwner(address newOwner) external {
        if (!guardians[msg.sender]) revert NotGuardian();
        if (newOwner == address(0) || newOwner == owner || newOwner == address(this) || guardians[newOwner]) {
            revert InvalidNewOwner();
        }
        if (newOwner != proposedOwner) {
            // A different candidate starts a clean round: every earlier approval is dropped.
            recoveryRound++;
            proposedOwner = newOwner;
            recoveryVotes = 0;
            emit RecoveryProposed(msg.sender, newOwner, recoveryRound);
        }
        if (_voted[recoveryRound][msg.sender]) revert AlreadyVoted();
        _voted[recoveryRound][msg.sender] = true;
        recoveryVotes++;
        emit RecoveryApproved(msg.sender, newOwner, recoveryVotes);

        if (recoveryVotes >= threshold) {
            address previous = owner;
            owner = newOwner;
            _clearRecovery();
            emit OwnerChanged(previous, newOwner);
        }
    }

    /// @notice The current owner cancels a pending recovery; all approvals are discarded.
    function cancelRecovery() external onlyOwner {
        if (proposedOwner == address(0)) revert NoRecovery();
        address cancelled = proposedOwner;
        _clearRecovery();
        emit RecoveryCancelled(msg.sender, cancelled);
    }

    function hasApproved(address guardian) external view returns (bool) {
        return proposedOwner != address(0) && _voted[recoveryRound][guardian];
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function _clearRecovery() private {
        recoveryRound++;
        proposedOwner = address(0);
        recoveryVotes = 0;
    }
}
