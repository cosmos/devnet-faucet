// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDT is ERC20 {
    constructor(address recipient) ERC20("Tether USD", "USDT") {
        _mint(recipient, 1000000000 * 10**6); // 1 billion USDT with 6 decimals
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}