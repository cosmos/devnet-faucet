// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FundMultiSend is Script {
    address constant FAUCET_ADDRESS = 0x42e6047c5780B103E52265F6483C2d0113aA6B87;
    address constant MULTISEND_ADDRESS = 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4;

    // Token addresses
    address constant WBTC_ADDRESS = 0x0312040979E0d6333F537A39b23a5DD6F574dBd8;
    address constant PEPE_ADDRESS = 0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61;
    address constant USDT_ADDRESS = 0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        console.log("==============================================");
        console.log("FUNDING MULTISEND CONTRACT");
        console.log("==============================================");
        console.log("Faucet Address:", FAUCET_ADDRESS);
        console.log("MultiSend Address:", MULTISEND_ADDRESS);
        console.log("==============================================");

        // Transfer 50% of each token to MultiSend for distribution

        // WBTC - Transfer 500M tokens (50% of 1B)
        IERC20 wbtc = IERC20(WBTC_ADDRESS);
        uint256 wbtcBalance = wbtc.balanceOf(FAUCET_ADDRESS);
        uint256 wbtcTransfer = wbtcBalance / 2;
        console.log("WBTC Balance:", wbtcBalance);
        console.log("Transferring WBTC:", wbtcTransfer);
        wbtc.transfer(MULTISEND_ADDRESS, wbtcTransfer);

        // PEPE - Transfer 500M tokens (50% of 1B)
        IERC20 pepe = IERC20(PEPE_ADDRESS);
        uint256 pepeBalance = pepe.balanceOf(FAUCET_ADDRESS);
        uint256 pepeTransfer = pepeBalance / 2;
        console.log("PEPE Balance:", pepeBalance);
        console.log("Transferring PEPE:", pepeTransfer);
        pepe.transfer(MULTISEND_ADDRESS, pepeTransfer);

        // USDT - Transfer 500M tokens (50% of 1B)
        IERC20 usdt = IERC20(USDT_ADDRESS);
        uint256 usdtBalance = usdt.balanceOf(FAUCET_ADDRESS);
        uint256 usdtTransfer = usdtBalance / 2;
        console.log("USDT Balance:", usdtBalance);
        console.log("Transferring USDT:", usdtTransfer);
        usdt.transfer(MULTISEND_ADDRESS, usdtTransfer);

        vm.stopBroadcast();

        console.log("==============================================");
        console.log("FUNDING COMPLETE");
        console.log("==============================================");

        // Verify balances
        console.log("MultiSend Token Balances:");
        console.log("WBTC:", wbtc.balanceOf(MULTISEND_ADDRESS));
        console.log("PEPE:", pepe.balanceOf(MULTISEND_ADDRESS));
        console.log("USDT:", usdt.balanceOf(MULTISEND_ADDRESS));
    }
}