// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title Pepe Token
 * @dev Pepe meme token for cosmos-evm testnet - community-driven fun token
 */
contract PEPE is ERC20, ERC20Burnable, Ownable, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address initialOwner) 
        ERC20("Pepe Token", "PEPE")
        Ownable()
    {
        // Transfer ownership to the provided initialOwner (faucet)
        _transferOwnership(initialOwner);

        // Grant roles to the initialOwner
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);

        // Mint initial supply to the initialOwner (faucet)
        _mint(initialOwner, 100000000000000000000000000); // Pepe Token initial supply
    }


    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
