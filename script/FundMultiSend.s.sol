// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FundMultiSend is Script {
    // Get addresses from environment variables for security
    function getFaucetAddress(uint256 deployerPrivateKey) internal pure returns (address) {
        return vm.addr(deployerPrivateKey);
    }
    
    function getMultiSendAddress() internal view returns (address) {
        string memory multisendEnv = vm.envString("MULTISEND_ADDRESS");
        return vm.parseAddress(multisendEnv);
    }

    // Token addresses from environment
    function getTokenAddresses() internal view returns (address wbtc, address pepe, address usdt) {
        wbtc = vm.parseAddress(vm.envString("WBTC_ADDRESS"));
        pepe = vm.parseAddress(vm.envString("PEPE_ADDRESS"));
        usdt = vm.parseAddress(vm.envString("USDT_ADDRESS"));
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address faucetAddress = getFaucetAddress(deployerPrivateKey);
        address multisendAddress = getMultiSendAddress();
        (address wbtcAddress, address pepeAddress, address usdtAddress) = getTokenAddresses();
        
        vm.startBroadcast(deployerPrivateKey);

        console.log("==============================================");
        console.log("FUNDING MULTISEND CONTRACT");
        console.log("==============================================");
        console.log("Faucet Address:", faucetAddress);
        console.log("MultiSend Address:", multisendAddress);
        console.log("==============================================");

        // Transfer 50% of each token to MultiSend for distribution

        // WBTC - Transfer 500M tokens (50% of 1B)
        IERC20 wbtc = IERC20(wbtcAddress);
        uint256 wbtcBalance = wbtc.balanceOf(faucetAddress);
        uint256 wbtcTransfer = wbtcBalance / 2;
        console.log("WBTC Balance:", wbtcBalance);
        console.log("Transferring WBTC:", wbtcTransfer);
        wbtc.transfer(multisendAddress, wbtcTransfer);

        // PEPE - Transfer 500M tokens (50% of 1B)
        IERC20 pepe = IERC20(pepeAddress);
        uint256 pepeBalance = pepe.balanceOf(faucetAddress);
        uint256 pepeTransfer = pepeBalance / 2;
        console.log("PEPE Balance:", pepeBalance);
        console.log("Transferring PEPE:", pepeTransfer);
        pepe.transfer(multisendAddress, pepeTransfer);

        // USDT - Transfer 500M tokens (50% of 1B)
        IERC20 usdt = IERC20(usdtAddress);
        uint256 usdtBalance = usdt.balanceOf(faucetAddress);
        uint256 usdtTransfer = usdtBalance / 2;
        console.log("USDT Balance:", usdtBalance);
        console.log("Transferring USDT:", usdtTransfer);
        usdt.transfer(multisendAddress, usdtTransfer);

        vm.stopBroadcast();

        console.log("==============================================");
        console.log("FUNDING COMPLETE");
        console.log("==============================================");

        // Verify balances
        console.log("MultiSend Token Balances:");
        console.log("WBTC:", IERC20(wbtcAddress).balanceOf(multisendAddress));
        console.log("PEPE:", IERC20(pepeAddress).balanceOf(multisendAddress));
        console.log("USDT:", IERC20(usdtAddress).balanceOf(multisendAddress));
    }
}