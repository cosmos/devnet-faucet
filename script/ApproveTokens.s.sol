// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract ApproveTokensScript is Script {
    // Token addresses
    address constant WBTC = 0x0312040979E0d6333F537A39b23a5DD6F574dBd8;
    address constant PEPE = 0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61;
    address constant USDT = 0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61;

    // Maximum approval amount (effectively unlimited)
    uint256 constant MAX_APPROVAL = type(uint256).max;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Get the MultiSend contract address from command line or use default
        address multiSendAddress = vm.envOr("MULTISEND_ADDRESS", 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4);

        vm.startBroadcast(deployerPrivateKey);

        console.log("Approving tokens for MultiSend contract:", multiSendAddress);
        console.log("Deployer/Faucet wallet:", deployer);

        // Approve WBTC
        IERC20 wbtc = IERC20(WBTC);
        console.log("\n--- WBTC ---");
        console.log("Balance:", wbtc.balanceOf(deployer));
        console.log("Current allowance:", wbtc.allowance(deployer, multiSendAddress));

        bool success = wbtc.approve(multiSendAddress, MAX_APPROVAL);
        require(success, "WBTC approval failed");
        console.log("New allowance:", wbtc.allowance(deployer, multiSendAddress));

        // Approve PEPE
        IERC20 pepe = IERC20(PEPE);
        console.log("\n--- PEPE ---");
        console.log("Balance:", pepe.balanceOf(deployer));
        console.log("Current allowance:", pepe.allowance(deployer, multiSendAddress));

        success = pepe.approve(multiSendAddress, MAX_APPROVAL);
        require(success, "PEPE approval failed");
        console.log("New allowance:", pepe.allowance(deployer, multiSendAddress));

        // Approve USDT
        IERC20 usdt = IERC20(USDT);
        console.log("\n--- USDT ---");
        console.log("Balance:", usdt.balanceOf(deployer));
        console.log("Current allowance:", usdt.allowance(deployer, multiSendAddress));

        success = usdt.approve(multiSendAddress, MAX_APPROVAL);
        require(success, "USDT approval failed");
        console.log("New allowance:", usdt.allowance(deployer, multiSendAddress));

        vm.stopBroadcast();

        console.log("\n=== APPROVAL SUMMARY ===");
        console.log("All tokens approved for MultiSend contract:", multiSendAddress);
        console.log("WBTC approved: MAX");
        console.log("PEPE approved: MAX");
        console.log("USDT approved: MAX");
    }
}