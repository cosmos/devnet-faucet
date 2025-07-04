// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title Minimal CREATE2 Factory
 * @dev Deploys contracts using CREATE2. The address where the contract
 * will be deployed can be known in advance via the {computeAddress} function.
 * 
 * This is the minimal implementation deployed at standard addresses on many chains.
 * Bytecode: 0x7fff...f3 (85 bytes)
 */
contract MinimalCreate2Factory {
    /**
     * @dev Deploys a contract using `CREATE2`. The address where the contract
     * will be deployed can be known in advance.
     *
     * The bytecode for a contract can be obtained from Solidity with
     * `type(contractName).creationCode`.
     *
     * Requirements:
     *
     * - `bytecode` must not be empty.
     * - `salt` must have not been used for `bytecode` already.
     */
    function deploy(bytes32 salt, bytes memory bytecode) public returns (address) {
        address addr;
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        return addr;
    }
}