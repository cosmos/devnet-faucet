// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC20Base.sol";

contract USDT is ERC20Base {
    constructor(address faucetAddress)
        ERC20Base(
            "Tether USD",
            "USDT",
            6,
            1000000000, // 1 billion tokens
            faucetAddress
        )
    {}
}