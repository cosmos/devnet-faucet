// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0 ^0.8.19;

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts v4.4.1 (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v4.9.0) (security/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be _NOT_ENTERED
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == _ENTERED;
    }
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v4.9.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// src/AtomicMultiSend.sol

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

