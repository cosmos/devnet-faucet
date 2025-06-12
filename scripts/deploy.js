import { ethers } from "hardhat";
import fs from 'fs';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(50));
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  console.log("=".repeat(50));

  const faucetAddress = "0x42e6047c5780b103e52265f6483c2d0113aa6b87";
  const deployedContracts = {};

  try {
    // Deploy WBTC Token
    console.log("\n📍 Deploying WBTC...");
    const WBTC = await ethers.getContractFactory("WBTC");
    const wbtc = await WBTC.deploy(faucetAddress);
    await wbtc.waitForDeployment();
    deployedContracts.WBTC = await wbtc.getAddress();
    console.log("✅ WBTC deployed to:", deployedContracts.WBTC);

    // Deploy PEPE Token
    console.log("\n📍 Deploying PEPE...");
    const PEPE = await ethers.getContractFactory("PEPE");
    const pepe = await PEPE.deploy(faucetAddress);
    await pepe.waitForDeployment();
    deployedContracts.PEPE = await pepe.getAddress();
    console.log("✅ PEPE deployed to:", deployedContracts.PEPE);

    // Deploy USDT Token
    console.log("\n📍 Deploying USDT...");
    const USDT = await ethers.getContractFactory("USDT");
    const usdt = await USDT.deploy(faucetAddress);
    await usdt.waitForDeployment();
    deployedContracts.USDT = await usdt.getAddress();
    console.log("✅ USDT deployed to:", deployedContracts.USDT);

    // Deploy MultiSend Contract
    console.log("\n📍 Deploying MultiSend...");
    const MultiSend = await ethers.getContractFactory("MultiSend");
    const multiSend = await MultiSend.deploy();
    await multiSend.waitForDeployment();
    deployedContracts.MultiSend = await multiSend.getAddress();
    console.log("✅ MultiSend deployed to:", deployedContracts.MultiSend);

    console.log("\n" + "=".repeat(50));
    console.log("📋 DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log("Network: Cosmos EVM (Chain ID: 262144)");
    console.log("Faucet Address:", faucetAddress);
    console.log("\n🪙 Token Contracts:");
    console.log("WBTC (8 decimals):", deployedContracts.WBTC);
    console.log("PEPE (18 decimals):", deployedContracts.PEPE);
    console.log("USDT (6 decimals):", deployedContracts.USDT);
    console.log("\n🔄 Utility Contracts:");
    console.log("MultiSend:", deployedContracts.MultiSend);

    // Verify token supplies
    console.log("\n" + "=".repeat(50));
    console.log("📊 TOKEN SUPPLY VERIFICATION");
    console.log("=".repeat(50));

    const wbtcContract = await ethers.getContractAt("WBTC", deployedContracts.WBTC);
    const pepeContract = await ethers.getContractAt("PEPE", deployedContracts.PEPE);
    const usdtContract = await ethers.getContractAt("USDT", deployedContracts.USDT);

    const wbtcSupply = await wbtcContract.totalSupply();
    const pepeSupply = await pepeContract.totalSupply();
    const usdtSupply = await usdtContract.totalSupply();

    const wbtcBalance = await wbtcContract.balanceOf(faucetAddress);
    const pepeBalance = await pepeContract.balanceOf(faucetAddress);
    const usdtBalance = await usdtContract.balanceOf(faucetAddress);

    console.log("WBTC Total Supply:", ethers.formatUnits(wbtcSupply, 8), "WBTC");
    console.log("WBTC Faucet Balance:", ethers.formatUnits(wbtcBalance, 8), "WBTC");

    console.log("PEPE Total Supply:", ethers.formatUnits(pepeSupply, 18), "PEPE");
    console.log("PEPE Faucet Balance:", ethers.formatUnits(pepeBalance, 18), "PEPE");

    console.log("USDT Total Supply:", ethers.formatUnits(usdtSupply, 6), "USDT");
    console.log("USDT Faucet Balance:", ethers.formatUnits(usdtBalance, 6), "USDT");

    // Transfer ownership of MultiSend to faucet address
    console.log("\n📋 Transferring MultiSend ownership to faucet address...");
    const multiSendContract = await ethers.getContractAt("MultiSend", deployedContracts.MultiSend);
    await multiSendContract.transferOwnership(faucetAddress);
    console.log("✅ MultiSend ownership transferred to:", faucetAddress);

    // Save deployment info to file
    const deploymentInfo = {
      network: "cosmos_evm",
      chainId: 262144,
      faucetAddress: faucetAddress,
      timestamp: new Date().toISOString(),
      contracts: deployedContracts,
      tokenSupplies: {
        WBTC: {
          totalSupply: wbtcSupply.toString(),
          decimals: 8,
          faucetBalance: wbtcBalance.toString()
        },
        PEPE: {
          totalSupply: pepeSupply.toString(),
          decimals: 18,
          faucetBalance: pepeBalance.toString()
        },
        USDT: {
          totalSupply: usdtSupply.toString(),
          decimals: 6,
          faucetBalance: usdtBalance.toString()
        }
      }
    };

    fs.writeFileSync('./deployment.json', JSON.stringify(deploymentInfo, null, 2));
    console.log("\n✅ Deployment info saved to deployment.json");

    console.log("\n" + "=".repeat(50));
    console.log("🎉 ALL CONTRACTS DEPLOYED SUCCESSFULLY!");
    console.log("=".repeat(50));

  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });