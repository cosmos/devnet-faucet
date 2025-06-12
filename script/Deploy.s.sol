// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/tokens/WBTC.sol";
import "../src/tokens/PEPE.sol";
import "../src/tokens/USDT.sol";
import "../src/utils/MultiSend.sol";

contract Deploy is Script {
    address constant FAUCET_ADDRESS = 0x42e6047c5780B103E52265F6483C2d0113aA6B87;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("==============================================");
        console.log("COSMOS EVM CONTRACT DEPLOYMENT");
        console.log("==============================================");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Faucet Address:", FAUCET_ADDRESS);
        console.log("Chain ID:", block.chainid);
        console.log("Block Number:", block.number);
        console.log("Timestamp:", block.timestamp);
        console.log("==============================================");

        // Deploy WBTC
        console.log("\n[1/4] Deploying WBTC Token...");
        WBTC wbtc = new WBTC(FAUCET_ADDRESS);
        console.log("WBTC deployed at:", address(wbtc));
        console.log("WBTC total supply:", wbtc.totalSupply());
        console.log("WBTC decimals:", wbtc.decimals());
        console.log("WBTC symbol:", wbtc.symbol());

        // Deploy PEPE
        console.log("\n[2/4] Deploying PEPE Token...");
        PEPE pepe = new PEPE(FAUCET_ADDRESS);
        console.log("PEPE deployed at:", address(pepe));
        console.log("PEPE total supply:", pepe.totalSupply());
        console.log("PEPE decimals:", pepe.decimals());
        console.log("PEPE symbol:", pepe.symbol());

        // Deploy USDT
        console.log("\n[3/4] Deploying USDT Token...");
        USDT usdt = new USDT(FAUCET_ADDRESS);
        console.log("USDT deployed at:", address(usdt));
        console.log("USDT total supply:", usdt.totalSupply());
        console.log("USDT decimals:", usdt.decimals());
        console.log("USDT symbol:", usdt.symbol());

        // Deploy MultiSend
        console.log("\n[4/4] Deploying MultiSend Contract...");
        MultiSend multiSend = new MultiSend();
        console.log("MultiSend deployed at:", address(multiSend));
        console.log("MultiSend owner:", multiSend.owner());

        // Transfer MultiSend ownership to faucet address
        console.log("\nTransferring MultiSend ownership to faucet...");
        multiSend.transferOwnership(FAUCET_ADDRESS);
        console.log("MultiSend new owner:", multiSend.owner());

        vm.stopBroadcast();

        console.log("\n==============================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("WBTC Address:", address(wbtc));
        console.log("PEPE Address:", address(pepe));
        console.log("USDT Address:", address(usdt));
        console.log("MultiSend Address:", address(multiSend));
        console.log("==============================================");

        // Verify balances
        console.log("\nToken Balance Verification:");
        console.log("WBTC Balance of Faucet:", wbtc.balanceOf(FAUCET_ADDRESS));
        console.log("PEPE Balance of Faucet:", pepe.balanceOf(FAUCET_ADDRESS));
        console.log("USDT Balance of Faucet:", usdt.balanceOf(FAUCET_ADDRESS));

        console.log("\nDeployment Summary JSON:");
        console.log("{");
        console.log('  "network": "cosmos_evm",');
        console.log('  "chainId": %s,', block.chainid);
        console.log('  "deployer": "%s",', vm.addr(deployerPrivateKey));
        console.log('  "faucetAddress": "%s",', FAUCET_ADDRESS);
        console.log('  "blockNumber": %s,', block.number);
        console.log('  "timestamp": %s,', block.timestamp);
        console.log('  "contracts": {');
        console.log('    "WBTC": "%s",', address(wbtc));
        console.log('    "PEPE": "%s",', address(pepe));
        console.log('    "USDT": "%s",', address(usdt));
        console.log('    "MultiSend": "%s"', address(multiSend));
        console.log('  }');
        console.log('}');
    }
}