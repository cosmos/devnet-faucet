// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/AtomicMultiSend.sol";

contract DeployAtomicMultiSend is Script {
    // Get faucet address from environment or derive from private key
    function getFaucetAddress(uint256 deployerPrivateKey) internal pure returns (address) {
        return vm.addr(deployerPrivateKey);
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address faucetAddress = getFaucetAddress(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        console.log("==============================================");
        console.log("ATOMIC MULTISEND CONTRACT DEPLOYMENT");
        console.log("==============================================");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Faucet Address:", faucetAddress);
        console.log("Chain ID:", block.chainid);
        console.log("Block Number:", block.number);
        console.log("Timestamp:", block.timestamp);
        console.log("==============================================");

        // Deploy AtomicMultiSend
        console.log("\nDeploying AtomicMultiSend Contract...");
        AtomicMultiSend atomicMultiSend = new AtomicMultiSend();
        console.log("AtomicMultiSend deployed at:", address(atomicMultiSend));
        console.log("AtomicMultiSend owner:", atomicMultiSend.owner());

        // Transfer AtomicMultiSend ownership to faucet address
        console.log("\nTransferring AtomicMultiSend ownership to faucet...");
        atomicMultiSend.transferOwnership(faucetAddress);
        console.log("AtomicMultiSend new owner:", atomicMultiSend.owner());

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("AtomicMultiSend Address:", address(atomicMultiSend));
        console.log("Owner:", atomicMultiSend.owner());
        console.log("==============================================");

        console.log("\nDeployment Summary JSON:");
        console.log("{");
        console.log('  "network": "cosmos_evm",');
        console.log('  "chainId": %s,', block.chainid);
        console.log('  "deployer": "%s",', vm.addr(deployerPrivateKey));
        console.log('  "faucetAddress": "%s",', faucetAddress);
        console.log('  "blockNumber": %s,', block.number);
        console.log('  "timestamp": %s,', block.timestamp);
        console.log('  "contracts": {');
        console.log('    "AtomicMultiSend": "%s"', address(atomicMultiSend));
        console.log('  }');
        console.log('}');
        
        console.log("\n==============================================");
        console.log("NEXT STEPS:");
        console.log("1. Update config.js with new AtomicMultiSend address:");
        console.log('   contracts: { atomicMultiSend: "%s" }', address(atomicMultiSend));
        console.log("2. Fund the contract with tokens");
        console.log("3. Update faucet.js to use atomicMultiSend function");
        console.log("4. Test atomic transfers");
        console.log("==============================================");
    }
}