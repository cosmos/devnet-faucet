// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/utils/MultiSend.sol";

contract DeployMultiSendV2Script is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy the updated MultiSend contract
        MultiSend multiSend = new MultiSend();

        console.log("MultiSend V2 deployed to:", address(multiSend));
        console.log("Owner:", multiSend.owner());

        vm.stopBroadcast();
    }
}