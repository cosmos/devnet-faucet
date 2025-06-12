// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MultiSend is Ownable {

    struct TokenTransfer {
        address token;      // ERC20 token address (address(0) for native token)
        uint256 amount;     // Amount to send
    }

    event MultiTransfer(address indexed recipient, TokenTransfer[] transfers);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Send multiple tokens (native and/or ERC20) to a single recipient
     * @param recipient Address to receive the tokens
     * @param transfers Array of token transfers to execute
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
                // ERC20 token transfer
                require(transfer.amount > 0, "MultiSend: transfer amount must be greater than 0");

                IERC20 token = IERC20(transfer.token);
                require(
                    token.balanceOf(address(this)) >= transfer.amount,
                    "MultiSend: insufficient token balance"
                );

                require(
                    token.transfer(recipient, transfer.amount),
                    "MultiSend: token transfer failed"
                );
            }
        }

        // Send native tokens if any
        if (nativeAmount > 0) {
            require(address(this).balance >= nativeAmount, "MultiSend: insufficient native balance");
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
            this.multiSend{value: msg.value / recipients.length}(recipients[i], transfers);
        }
    }

    /**
     * @dev Deposit ERC20 tokens to the contract
     * @param token ERC20 token address
     * @param amount Amount to deposit
     */
    function depositToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "MultiSend: token cannot be zero address");
        require(amount > 0, "MultiSend: amount must be greater than 0");

        IERC20 erc20Token = IERC20(token);
        require(
            erc20Token.transfer(address(this), amount),
            "MultiSend: token deposit failed"
        );
    }

    /**
     * @dev Withdraw ERC20 tokens from the contract
     * @param token ERC20 token address
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "MultiSend: token cannot be zero address");

        IERC20 erc20Token = IERC20(token);
        require(
            erc20Token.balanceOf(address(this)) >= amount,
            "MultiSend: insufficient token balance"
        );

        require(
            erc20Token.transfer(owner(), amount),
            "MultiSend: token withdrawal failed"
        );
    }

    /**
     * @dev Withdraw native tokens from the contract
     * @param amount Amount to withdraw (0 = withdraw all)
     */
    function withdrawNative(uint256 amount) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "MultiSend: no native balance");

        uint256 withdrawAmount = (amount == 0) ? balance : amount;
        require(balance >= withdrawAmount, "MultiSend: insufficient native balance");

        (bool success, ) = payable(owner()).call{value: withdrawAmount}("");
        require(success, "MultiSend: native withdrawal failed");
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



    // Receive function to accept native token deposits
    receive() external payable {}

    // Fallback function
    fallback() external payable {}
}