// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/utils/MultiSendV2.sol";
import "../contracts/utils/MultiSendProxy.sol";

contract UpgradeMultiSendScript is Script {
    // Current MultiSend contract address
    address constant CURRENT_MULTISEND = 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Current MultiSend:", CURRENT_MULTISEND);

        // Step 1: Deploy the new MultiSendV2 implementation
        MultiSendV2 multiSendV2 = new MultiSendV2();
        console.log("MultiSendV2 implementation deployed to:", address(multiSendV2));

        // Step 2: Deploy the proxy pointing to the current MultiSend
        MultiSendProxy proxy = new MultiSendProxy(CURRENT_MULTISEND);
        console.log("MultiSendProxy deployed to:", address(proxy));
        console.log("Proxy admin:", proxy.admin());
        console.log("Current implementation:", proxy.implementation());

        // Step 3: Upgrade the proxy to point to MultiSendV2
        proxy.upgrade(address(multiSendV2));
        console.log("Proxy upgraded to MultiSendV2");
        console.log("New implementation:", proxy.implementation());

        // Step 4: Initialize the new implementation through the proxy
        // We need to call initialize on the proxy, which will delegate to MultiSendV2
        MultiSendV2 proxyAsV2 = MultiSendV2(payable(address(proxy)));
        proxyAsV2.initialize(deployer);
        console.log("MultiSendV2 initialized with owner:", deployer);

        // Verify the upgrade worked
        console.log("Version:", proxyAsV2.version());
        console.log("Owner:", proxyAsV2.owner());
        console.log("Initialized:", proxyAsV2.initialized());

        vm.stopBroadcast();

        console.log("\n=== UPGRADE SUMMARY ===");
        console.log("Proxy Address:", address(proxy));
        console.log("Implementation Address:", address(multiSendV2));
        console.log("Owner:", deployer);
        console.log("Version:", proxyAsV2.version());
        console.log("\nTo use the upgraded contract, update your faucet config to use the proxy address:");
        console.log("MultiSend Address:", address(proxy));
    }
}