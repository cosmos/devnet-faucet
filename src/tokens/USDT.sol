// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title Tether USD
 * @dev USDT stablecoin for cosmos-evm testnet
 */
contract USDT is ERC20, ERC20Burnable, Ownable, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address initialOwner) 
        ERC20("Tether USD", "USDT")
        Ownable()
    {
        // Transfer ownership to deployer
        _transferOwnership(msg.sender);

        // Grant roles
        _grantRole(MINTER_ROLE, 0x42e6047c5780B103E52265F6483C2d0113aA6B87);

        // Initial token distribution
        _mint(0x42e6047c5780B103E52265F6483C2d0113aA6B87, 100000000000000);
    }


    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
