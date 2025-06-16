// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AtomicMultiSend
 * @dev Atomic multi-token faucet contract that ensures all-or-nothing token distribution
 * Designed to work reliably with Tendermint consensus by executing all transfers in a single transaction
 */
contract AtomicMultiSend is Ownable, ReentrancyGuard {
    
    struct TokenTransfer {
        address token;      // ERC20 contract address (address(0) for native token)
        uint256 amount;     // Amount to transfer
    }
    
    event AtomicMultiSent(
        address indexed recipient, 
        uint256 nativeAmount, 
        TokenTransfer[] transfers,
        uint256 timestamp
    );
    
    event TokensDeposited(address indexed token, uint256 amount, address indexed depositor);
    event TokensWithdrawn(address indexed token, uint256 amount, address indexed recipient);
    
    // Track total deposits for accounting
    mapping(address => uint256) public totalDeposits;
    
    constructor() Ownable() {}
    
    /**
     * @dev Atomically send multiple tokens to a single recipient
     * @param recipient Address to receive the tokens
     * @param transfers Array of token transfers to execute atomically
     * 
     * This function ensures ALL transfers succeed or the entire transaction reverts
     */
    function atomicMultiSend(
        address payable recipient, 
        TokenTransfer[] calldata transfers
    ) external payable onlyOwner nonReentrant {
        require(recipient != address(0), "AtomicMultiSend: recipient cannot be zero address");
        require(transfers.length > 0, "AtomicMultiSend: no transfers specified");
        
        uint256 nativeAmount = 0;
        
        // STEP 1: Validate all transfers BEFORE executing any
        for (uint256 i = 0; i < transfers.length; i++) {
            TokenTransfer calldata transfer = transfers[i];
            
            if (transfer.token == address(0)) {
                // Native token validation
                nativeAmount += transfer.amount;
            } else {
                // ERC20 token validation
                require(transfer.amount > 0, "AtomicMultiSend: transfer amount must be greater than 0");
                
                IERC20 token = IERC20(transfer.token);
                // Check allowance instead of contract balance
                uint256 allowance = token.allowance(owner(), address(this));
                require(
                    allowance >= transfer.amount,
                    string(abi.encodePacked(
                        "AtomicMultiSend: insufficient allowance for token ",
                        addressToString(transfer.token)
                    ))
                );
                
                // Also check owner's balance
                uint256 ownerBalance = token.balanceOf(owner());
                require(
                    ownerBalance >= transfer.amount,
                    string(abi.encodePacked(
                        "AtomicMultiSend: insufficient owner balance for token ",
                        addressToString(transfer.token)
                    ))
                );
            }
        }
        
        // Validate native token amount
        if (nativeAmount > 0) {
            require(
                owner().balance >= nativeAmount,
                "AtomicMultiSend: insufficient native token balance in owner account"
            );
        }
        
        // STEP 2: Execute ALL transfers (all-or-nothing)
        for (uint256 i = 0; i < transfers.length; i++) {
            TokenTransfer calldata transfer = transfers[i];
            
            if (transfer.token == address(0)) {
                // Native token transfer - will be handled at the end
                continue;
            } else {
                // ERC20 token transfer using transferFrom
                IERC20 token = IERC20(transfer.token);
                bool success = token.transferFrom(owner(), recipient, transfer.amount);
                require(success, "AtomicMultiSend: ERC20 transferFrom failed");
            }
        }
        
        // STEP 3: Send native tokens if any (must be last to prevent reentrancy)
        if (nativeAmount > 0) {
            require(msg.value >= nativeAmount, "AtomicMultiSend: insufficient native tokens sent");
            (bool success, ) = recipient.call{value: nativeAmount}("");
            require(success, "AtomicMultiSend: native token transfer failed");
            
            // Return excess native tokens to owner if any
            if (msg.value > nativeAmount) {
                (bool refundSuccess, ) = payable(owner()).call{value: msg.value - nativeAmount}("");
                require(refundSuccess, "AtomicMultiSend: refund failed");
            }
        } else if (msg.value > 0) {
            // Return all sent native tokens if none needed
            (bool refundSuccess, ) = payable(owner()).call{value: msg.value}("");
            require(refundSuccess, "AtomicMultiSend: refund failed");
        }
        
        // STEP 4: Emit event for successful atomic transfer
        emit AtomicMultiSent(recipient, nativeAmount, transfers, block.timestamp);
    }
    
    /**
     * @dev Batch atomic send to multiple recipients (same tokens for each)
     * @param recipients Array of recipient addresses
     * @param transfersPerRecipient Array of transfers to send to each recipient
     */
    function batchAtomicMultiSend(
        address payable[] calldata recipients,
        TokenTransfer[] calldata transfersPerRecipient
    ) external payable onlyOwner nonReentrant {
        require(recipients.length > 0, "AtomicMultiSend: no recipients specified");
        require(transfersPerRecipient.length > 0, "AtomicMultiSend: no transfers specified");
        
        // Execute atomic multi-send for each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            // Calculate native amount needed for this recipient
            uint256 nativeAmountForRecipient = 0;
            for (uint256 j = 0; j < transfersPerRecipient.length; j++) {
                if (transfersPerRecipient[j].token == address(0)) {
                    nativeAmountForRecipient += transfersPerRecipient[j].amount;
                }
            }
            
            // Call internal function with appropriate native amount
            this.atomicMultiSend{value: nativeAmountForRecipient}(
                recipients[i], 
                transfersPerRecipient
            );
        }
    }
    
    /**
     * @dev Deposit ERC20 tokens to the contract
     * @param token ERC20 token address  
     * @param amount Amount to deposit
     */
    function depositToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "AtomicMultiSend: token cannot be zero address");
        require(amount > 0, "AtomicMultiSend: amount must be greater than 0");
        
        IERC20 erc20Token = IERC20(token);
        
        // Transfer tokens from owner to this contract
        bool success = erc20Token.transferFrom(msg.sender, address(this), amount);
        require(success, "AtomicMultiSend: token deposit failed");
        
        totalDeposits[token] += amount;
        emit TokensDeposited(token, amount, msg.sender);
    }
    
    /**
     * @dev Withdraw ERC20 tokens from the contract
     * @param token ERC20 token address
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "AtomicMultiSend: token cannot be zero address");
        
        IERC20 erc20Token = IERC20(token);
        uint256 contractBalance = erc20Token.balanceOf(address(this));
        require(contractBalance >= amount, "AtomicMultiSend: insufficient token balance");
        
        bool success = erc20Token.transfer(owner(), amount);
        require(success, "AtomicMultiSend: token withdrawal failed");
        
        emit TokensWithdrawn(token, amount, owner());
    }
    
    /**
     * @dev Withdraw native tokens from the contract
     * @param amount Amount to withdraw (0 = withdraw all)
     */
    function withdrawNative(uint256 amount) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AtomicMultiSend: no native balance");
        
        uint256 withdrawAmount = (amount == 0) ? balance : amount;
        require(balance >= withdrawAmount, "AtomicMultiSend: insufficient native balance");
        
        (bool success, ) = payable(owner()).call{value: withdrawAmount}("");
        require(success, "AtomicMultiSend: native withdrawal failed");
        
        emit TokensWithdrawn(address(0), withdrawAmount, owner());
    }
    
    /**
     * @dev Get contract's balance for a specific token
     * @param token ERC20 token address (address(0) for native)
     */
    function getBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }
    
    /**
     * @dev Get multiple token balances at once (for frontend efficiency)
     * @param tokens Array of token addresses to check
     */
    function getBalances(address[] calldata tokens) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            balances[i] = this.getBalance(tokens[i]);
        }
        return balances;
    }
    
    /**
     * @dev Emergency function to recover any stuck tokens
     * @param token Token address (address(0) for native)
     * @param amount Amount to recover
     */
    function emergencyRecover(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            // Recover native tokens
            require(address(this).balance >= amount, "AtomicMultiSend: insufficient native balance");
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "AtomicMultiSend: native recovery failed");
        } else {
            // Recover ERC20 tokens
            IERC20 erc20Token = IERC20(token);
            uint256 contractBalance = erc20Token.balanceOf(address(this));
            require(contractBalance >= amount, "AtomicMultiSend: insufficient token balance");
            
            bool success = erc20Token.transfer(owner(), amount);
            require(success, "AtomicMultiSend: token recovery failed");
        }
        
        emit TokensWithdrawn(token, amount, owner());
    }
    
    /**
     * @dev Utility function to convert address to string for error messages
     */
    function addressToString(address addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }
    
    // Receive function to accept native token deposits
    receive() external payable {
        emit TokensDeposited(address(0), msg.value, msg.sender);
    }
    
    // Fallback function
    fallback() external payable {
        emit TokensDeposited(address(0), msg.value, msg.sender);
    }
}