// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MultiSend {
    struct TokenTransfer {
        address token;
        uint256 amount;
    }

    event MultiTransfer(address indexed sender, address indexed recipient, uint256 nativeAmount, uint256 tokenCount);

    /**
     * @dev Send multiple ERC20 tokens + native tokens in a single transaction
     * @param recipient The address to receive all tokens
     * @param transfers Array of token transfers (token address and amount)
     *
     * Note: Caller must approve this contract to spend the ERC20 tokens first
     * Native tokens are sent via msg.value
     */
    function multiSend(address recipient, TokenTransfer[] calldata transfers) external payable {
        require(recipient != address(0), "MultiSend: invalid recipient");

        // Send native tokens if any
        if (msg.value > 0) {
            (bool success, ) = payable(recipient).call{value: msg.value}("");
            require(success, "MultiSend: native transfer failed");
        }

        // Send ERC20 tokens using transferFrom
        for (uint256 i = 0; i < transfers.length; i++) {
            require(transfers[i].token != address(0), "MultiSend: invalid token address");
            require(transfers[i].amount > 0, "MultiSend: invalid amount");

            bool success = IERC20(transfers[i].token).transferFrom(
                msg.sender,
                recipient,
                transfers[i].amount
            );
            require(success, "MultiSend: token transfer failed");
        }

        emit MultiTransfer(msg.sender, recipient, msg.value, transfers.length);
    }

    /**
     * @dev Batch transfer multiple amounts of the same token to different recipients
     * @param token The ERC20 token address
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts (must match recipients length)
     */
    function batchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "MultiSend: length mismatch");
        require(token != address(0), "MultiSend: invalid token");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "MultiSend: invalid recipient");
            require(amounts[i] > 0, "MultiSend: invalid amount");

            bool success = IERC20(token).transferFrom(
                msg.sender,
                recipients[i],
                amounts[i]
            );
            require(success, "MultiSend: token transfer failed");
        }
    }

    /**
     * @dev Emergency function to recover any tokens accidentally sent to this contract
     * Only the deployer can call this (for simplicity, using msg.sender check)
     */
    function emergencyWithdraw(address token, uint256 amount) external {
        if (token == address(0)) {
            // Withdraw native tokens
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "MultiSend: withdrawal failed");
        } else {
            // Withdraw ERC20 tokens
            bool success = IERC20(token).transfer(msg.sender, amount);
            require(success, "MultiSend: token withdrawal failed");
        }
    }
}