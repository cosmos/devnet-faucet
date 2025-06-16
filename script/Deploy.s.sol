// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/tokens/WBTC.sol";
import "../src/tokens/PEPE.sol";
import "../src/tokens/USDT.sol";
import "../src/AtomicMultiSend.sol";

contract Deploy is Script {
    // Get faucet address from environment or derive from private key
    function getFaucetAddress(uint256 deployerPrivateKey) internal pure returns (address) {
        return vm.addr(deployerPrivateKey);
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address faucetAddress = getFaucetAddress(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        console.log("==============================================");
        console.log("COSMOS EVM CONTRACT DEPLOYMENT");
        console.log("==============================================");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Faucet Address:", faucetAddress);
        console.log("Chain ID:", block.chainid);
        console.log("Block Number:", block.number);
        console.log("Timestamp:", block.timestamp);
        console.log("==============================================");

        // Deploy WBTC
        console.log("\n[1/4] Deploying WBTC Token...");
        WBTC wbtc = new WBTC(faucetAddress);
        console.log("WBTC deployed at:", address(wbtc));
        console.log("WBTC total supply:", wbtc.totalSupply());
        console.log("WBTC decimals:", wbtc.decimals());
        console.log("WBTC symbol:", wbtc.symbol());

        // Deploy PEPE
        console.log("\n[2/4] Deploying PEPE Token...");
        PEPE pepe = new PEPE(faucetAddress);
        console.log("PEPE deployed at:", address(pepe));
        console.log("PEPE total supply:", pepe.totalSupply());
        console.log("PEPE decimals:", pepe.decimals());
        console.log("PEPE symbol:", pepe.symbol());

        // Deploy USDT
        console.log("\n[3/4] Deploying USDT Token...");
        USDT usdt = new USDT(faucetAddress);
        console.log("USDT deployed at:", address(usdt));
        console.log("USDT total supply:", usdt.totalSupply());
        console.log("USDT decimals:", usdt.decimals());
        console.log("USDT symbol:", usdt.symbol());

        // Deploy AtomicMultiSend
        console.log("\n[4/4] Deploying AtomicMultiSend Contract...");
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
        console.log("WBTC Address:", address(wbtc));
        console.log("PEPE Address:", address(pepe));
        console.log("USDT Address:", address(usdt));
        console.log("AtomicMultiSend Address:", address(atomicMultiSend));
        console.log("==============================================");

        // Verify balances
        console.log("\nToken Balance Verification:");
        console.log("WBTC Balance of Faucet:", wbtc.balanceOf(faucetAddress));
        console.log("PEPE Balance of Faucet:", pepe.balanceOf(faucetAddress));
        console.log("USDT Balance of Faucet:", usdt.balanceOf(faucetAddress));

        console.log("\nDeployment Summary JSON:");
        console.log("{");
        console.log('  "network": "cosmos_evm",');
        console.log('  "chainId": %s,', block.chainid);
        console.log('  "deployer": "%s",', vm.addr(deployerPrivateKey));
        console.log('  "faucetAddress": "%s",', faucetAddress);
        console.log('  "blockNumber": %s,', block.number);
        console.log('  "timestamp": %s,', block.timestamp);
        console.log('  "contracts": {');
        console.log('    "WBTC": "%s",', address(wbtc));
        console.log('    "PEPE": "%s",', address(pepe));
        console.log('    "USDT": "%s",', address(usdt));
        console.log('    "AtomicMultiSend": "%s"', address(atomicMultiSend));
        console.log('  }');
        console.log('}');
    }
}