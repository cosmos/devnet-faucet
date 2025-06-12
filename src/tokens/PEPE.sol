// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PEPE is ERC20 {
    constructor(address recipient) ERC20("Pepe", "PEPE") {
        _mint(recipient, 1000000000 * 10**18); // 1 billion PEPE with 18 decimals
    }
}