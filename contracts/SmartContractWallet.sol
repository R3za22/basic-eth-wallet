//SPDX-License-Identifier: MIT

pragma solidity 0.8.35;


// for testing porpose
contract Consumer {
    function getBalance() public view returns(uint){
        return address(this).balance;
    }

    function deposit() public payable {}
}

contract SmartContractWallet {
    
    address payable public owner;

    mapping (address => uint) public allowance;
    mapping (address => bool) public isAllowedToSend;

    mapping (address => bool) public guardians;
    address payable nextOwner;
    mapping(address => mapping(address => bool)) nextOwnerGuardianVotedBool;
    uint guardianResetCount;
    uint public constant confirmationsFromGuardiansForReset = 3;


    constructor() {
        owner = payable(msg.sender);
    }    

    function setGuardian (address _guardian ,bool _isGuardian) public {
        require(msg.sender == owner, "you are not the owner");

        guardians[_guardian] = _isGuardian;

    }

    function proposeNewOwner (address payable _newOwner) public {
        require(guardians[msg.sender], "you are not a guardian of this wallet");
        require(nextOwnerGuardianVotedBool[_newOwner][msg.sender] == false, "you already Voted");

        if(_newOwner != nextOwner){
            nextOwner = _newOwner;
            guardianResetCount = 0;
            // Clear voting records for new proposal
            // In a real contract, you'd want to clear old votes here
        }

        // Mark that this guardian has voted
        nextOwnerGuardianVotedBool[_newOwner][msg.sender] = true;
        guardianResetCount++;

        if(guardianResetCount >= confirmationsFromGuardiansForReset){
            owner = nextOwner;
            nextOwner = payable(address(0));
            guardianResetCount = 0;
            // Optionally reset voting records after successful transfer
        }
    }

    function setAllowance(address _for , uint _amount) public {
        require(msg.sender == owner, "you are not the owner");
        allowance[_for] = _amount;
        if(_amount > 0)
            isAllowedToSend[_for] = true;
        else 
            isAllowedToSend[_for] = false;
    }

    function transfer(address payable _to, uint _amount, bytes memory _payload) public returns(bytes memory) {

        if(msg.sender != owner){
            require(isAllowedToSend[msg.sender], "you are not allowed to send anything from this smart contract");
            require(allowance[msg.sender] >= _amount, "you are trying to send more than you are allowed to");

            allowance[msg.sender] -= _amount;
        }

        (bool success, bytes memory returnData) = _to.call{value: _amount}(_payload);
        require(success, "transfer failed");
        return returnData;
    }

    receive() external payable { }
    
    // Helper function to check contract balance
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}