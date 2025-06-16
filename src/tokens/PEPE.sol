// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title Pepe Token
 * @dev Pepe meme token for cosmos-evm testnet
 */
contract PEPE is ERC20, ERC20Burnable, Ownable, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address initialOwner) 
        ERC20("Pepe Token", "PEPE")
        Ownable()
    {
        // Grant roles to initial owner
        _grantRole(MINTER_ROLE, initialOwner);
        _transferOwnership(initialOwner);

        // Initial token distribution to owner
        _mint(initialOwner, 100000000000000000000000000);
    }


    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
