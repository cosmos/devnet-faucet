import { ethers } from "hardhat";
import fs from 'fs';
import config from '../../config.js';
import { pathToString } from '@cosmjs/crypto';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log(" DEPLOYING ATOMIC MULTISEND CONTRACT");
  console.log("=".repeat(60));
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("Network:", config.blockchain.name);
  console.log("Chain ID:", config.blockchain.ids.chainId);

  // Get faucet address from centralized config
  const faucetWallet = ethers.HDNodeWallet.fromPhrase(
    config.blockchain.sender.mnemonic,
    undefined,
    pathToString(config.blockchain.sender.option.hdPaths[0])
  );
  const faucetAddress = faucetWallet.address;

  try {
    // Deploy AtomicMultiSend Contract
    console.log("\n Deploying AtomicMultiSend...");
    const AtomicMultiSend = await ethers.getContractFactory("AtomicMultiSend");
    const atomicMultiSend = await AtomicMultiSend.deploy();
    await atomicMultiSend.waitForDeployment();
    const atomicMultiSendAddress = await atomicMultiSend.getAddress();
    console.log(" AtomicMultiSend deployed to:", atomicMultiSendAddress);

    // Transfer ownership to faucet address
    console.log("\n Transferring ownership to faucet address...");
    await atomicMultiSend.transferOwnership(faucetAddress);
    console.log(" Ownership transferred to:", faucetAddress);

    // Verify ownership transfer
    const newOwner = await atomicMultiSend.owner();
    console.log(" Verified new owner:", newOwner);

    // Get contract ABI for storage
    const contractABI = AtomicMultiSend.interface.format('json');

    // Create deployment info object
    const deploymentInfo = {
      network: config.blockchain.name,
      chainId: config.blockchain.ids.chainId,
      cosmosChainId: config.blockchain.ids.cosmosChainId,
      faucetAddress: faucetAddress,
      timestamp: new Date().toISOString(),
      contracts: {
        AtomicMultiSend: atomicMultiSendAddress,
        // Keep existing token contracts from config
        WBTC: config.blockchain.tx.amounts.find(t => t.denom === 'wbtc')?.erc20_contract,
        PEPE: config.blockchain.tx.amounts.find(t => t.denom === 'pepe')?.erc20_contract,
        USDT: config.blockchain.tx.amounts.find(t => t.denom === 'usdt')?.erc20_contract
      },
      abi: {
        AtomicMultiSend: JSON.parse(contractABI)
      },
      gasUsed: {
        deployment: "TBD" // Will be filled by actual deployment
      }
    };

    // Save deployment info
    const deploymentPath = './deployments/atomic-multisend-deployment.json';
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(" Deployment info saved to:", deploymentPath);

    // Save ABI separately for easy access
    const abiPath = './deployments/AtomicMultiSend.abi.json';
    fs.writeFileSync(abiPath, JSON.stringify(JSON.parse(contractABI), null, 2));
    console.log(" ABI saved to:", abiPath);

    // Update latest addresses file
    const latestAddresses = {
      AtomicMultiSend: atomicMultiSendAddress,
      WBTC: config.blockchain.tx.amounts.find(t => t.denom === 'wbtc')?.erc20_contract,
      PEPE: config.blockchain.tx.amounts.find(t => t.denom === 'pepe')?.erc20_contract,
      USDT: config.blockchain.tx.amounts.find(t => t.denom === 'usdt')?.erc20_contract,
      lastUpdated: new Date().toISOString(),
      network: config.blockchain.name,
      chainId: config.blockchain.ids.chainId
    };
    
    fs.writeFileSync('./deployments/latest-addresses.json', JSON.stringify(latestAddresses, null, 2));
    console.log(" Latest addresses updated");

    console.log("\n" + "=".repeat(60));
    console.log(" DEPLOYMENT COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("AtomicMultiSend Address:", atomicMultiSendAddress);
    console.log("Owner Address:", faucetAddress);
    console.log("Network:", config.blockchain.name);
    console.log("Chain ID:", config.blockchain.ids.chainId);

    // Display next steps
    console.log("\n NEXT STEPS:");
    console.log("1. Fund the AtomicMultiSend contract with tokens");
    console.log("2. Update config.js with new contract address");
    console.log("3. Update faucet.js to use atomicMultiSend function");
    console.log("4. Test the atomic transfers");

    return {
      atomicMultiSendAddress,
      faucetAddress,
      deploymentInfo
    };

  } catch (error) {
    console.error("\n Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { main as deployAtomicMultiSend };

// Run deployment if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}