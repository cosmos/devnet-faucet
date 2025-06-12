// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title MultiFaucet
 * @dev Contract for sending multiple ERC20 tokens in a single transaction
 * This contract should be funded with ERC20 tokens and native tokens
 * The faucet bot will call this contract to distribute tokens efficiently
 */
contract MultiFaucet {
    address public owner;
    
    struct TokenTransfer {
        address token;      // ERC20 contract address
        uint256 amount;     // Amount to transfer
    }
    
    event MultiSent(address indexed recipient, uint256 nativeAmount, TokenTransfer[] tokens);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Send multiple ERC20 tokens to a single recipient
     * @param recipient The address to receive the tokens
     * @param transfers Array of token transfers to execute
     */
    function multiSend(address recipient, TokenTransfer[] calldata transfers) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        
        for (uint i = 0; i < transfers.length; i++) {
            require(transfers[i].token != address(0), "Invalid token address");
            require(transfers[i].amount > 0, "Invalid amount");
            
            IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
        }
        
        emit MultiSent(recipient, 0, transfers);
    }
    
    /**
     * @dev Send native token + multiple ERC20 tokens in one transaction
     * @param recipient The address to receive the tokens
     * @param transfers Array of ERC20 token transfers to execute
     */
    function multiSendWithNative(address payable recipient, TokenTransfer[] calldata transfers) external payable onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        
        // Send native token if any
        if (msg.value > 0) {
            recipient.transfer(msg.value);
        }
        
        // Send ERC20 tokens
        for (uint i = 0; i < transfers.length; i++) {
            require(transfers[i].token != address(0), "Invalid token address");
            require(transfers[i].amount > 0, "Invalid amount");
            
            IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
        }
        
        emit MultiSent(recipient, msg.value, transfers);
    }
    
    /**
     * @dev Get balance of a specific ERC20 token held by this contract
     * @param token The ERC20 token contract address
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    /**
     * @dev Get native token balance of this contract
     */
    function getNativeBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Emergency function to withdraw ERC20 tokens
     * @param token The ERC20 token contract address
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }
    
    /**
     * @dev Emergency function to withdraw native tokens
     * @param amount Amount to withdraw
     */
    function emergencyWithdrawNative(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }
    
    /**
     * @dev Transfer ownership of the contract
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
    
    /**
     * @dev Allow contract to receive native tokens
     */
    receive() external payable {}
}