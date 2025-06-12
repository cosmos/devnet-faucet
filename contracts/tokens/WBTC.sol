// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC20Base.sol";

contract WBTC is ERC20Base {
    constructor(address faucetAddress)
        ERC20Base(
            "Wrapped Bitcoin",
            "WBTC",
            8,
            1000000000, // 1 billion tokens
            faucetAddress
        )
    {}
}