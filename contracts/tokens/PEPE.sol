// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ERC20Base.sol";

contract PEPE is ERC20Base {
    constructor(address faucetAddress)
        ERC20Base(
            "Pepe Token",
            "PEPE",
            18,
            1000000000, // 1 billion tokens
            faucetAddress
        )
    {}
}