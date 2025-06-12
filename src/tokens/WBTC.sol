// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
    constructor(address recipient) ERC20("Wrapped Bitcoin", "WBTC") {
        _mint(recipient, 1000000000 * 10**8); // 1 billion WBTC with 8 decimals
    }

    function decimals() public view virtual override returns (uint8) {
        return 8;
    }
}