// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract MultiSend {
    address public owner;

    struct TokenTransfer {
        address token;      // ERC20 token address (address(0) for native token)
        uint256 amount;     // Amount to send
    }

    event MultiTransfer(address indexed recipient, TokenTransfer[] transfers);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "MultiSend: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Send multiple tokens (native and/or ERC20) to a single recipient
     * @param recipient Address to receive the tokens
     * @param transfers Array of token transfers to execute
     * Note: For ERC20 tokens, the owner must have approved this contract to spend the tokens
     */
    function multiSend(address payable recipient, TokenTransfer[] calldata transfers) external payable onlyOwner {
        require(recipient != address(0), "MultiSend: recipient cannot be zero address");
        require(transfers.length > 0, "MultiSend: no transfers specified");

        uint256 nativeAmount = 0;

        for (uint256 i = 0; i < transfers.length; i++) {
            TokenTransfer memory transfer = transfers[i];

            if (transfer.token == address(0)) {
                // Native token transfer
                nativeAmount += transfer.amount;
            } else {
                // ERC20 token transfer using transferFrom
                require(transfer.amount > 0, "MultiSend: transfer amount must be greater than 0");

                IERC20 token = IERC20(transfer.token);

                // Check that the owner has sufficient balance
                require(
                    token.balanceOf(owner) >= transfer.amount,
                    "MultiSend: insufficient token balance in owner wallet"
                );

                // Check that this contract has sufficient allowance
                require(
                    token.allowance(owner, address(this)) >= transfer.amount,
                    "MultiSend: insufficient allowance for token transfer"
                );

                // Transfer tokens from owner to recipient
                require(
                    token.transferFrom(owner, recipient, transfer.amount),
                    "MultiSend: token transfer failed"
                );
            }
        }

        // Send native tokens if any (these come from msg.value)
        if (nativeAmount > 0) {
            require(msg.value >= nativeAmount, "MultiSend: insufficient native value sent");
            (bool success, ) = recipient.call{value: nativeAmount}("");
            require(success, "MultiSend: native transfer failed");
        }

        emit MultiTransfer(recipient, transfers);
    }

    /**
     * @dev Batch send tokens to multiple recipients (for faucet efficiency)
     * @param recipients Array of recipient addresses
     * @param transfers Array of token transfers (same for all recipients)
     */
    function batchMultiSend(
        address payable[] calldata recipients,
        TokenTransfer[] calldata transfers
    ) external payable onlyOwner {
        require(recipients.length > 0, "MultiSend: no recipients specified");

        for (uint256 i = 0; i < recipients.length; i++) {
            this.multiSend(recipients[i], transfers);
        }
    }

    /**
     * @dev Get owner's balance for a specific token
     * @param token ERC20 token address (address(0) for native)
     */
    function getOwnerBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return owner.balance;
        } else {
            return IERC20(token).balanceOf(owner);
        }
    }

    /**
     * @dev Get allowance for a specific token
     * @param token ERC20 token address
     */
    function getAllowance(address token) external view returns (uint256) {
        require(token != address(0), "MultiSend: token cannot be zero address");
        return IERC20(token).allowance(owner, address(this));
    }

    /**
     * @dev Transfer ownership of the contract
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MultiSend: new owner cannot be zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // Receive function to accept native token deposits
    receive() external payable {}

    // Fallback function
    fallback() external payable {}
}