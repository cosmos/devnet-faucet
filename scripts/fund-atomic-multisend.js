import { ethers } from "hardhat";
import fs from 'fs';
import config from '../config.js';
import { pathToString } from '@cosmjs/crypto';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("💰 FUNDING ATOMIC MULTISEND CONTRACT");
  console.log("=".repeat(60));

  // Load latest deployment addresses
  const latestAddresses = JSON.parse(fs.readFileSync('./deployments/latest-addresses.json', 'utf8'));
  const atomicMultiSendAddress = latestAddresses.AtomicMultiSend;
  
  if (!atomicMultiSendAddress) {
    throw new Error("AtomicMultiSend address not found in latest-addresses.json");
  }

  console.log("AtomicMultiSend Address:", atomicMultiSendAddress);
  console.log("Funding from account:", deployer.address);

  // Get faucet wallet (owner of tokens)
  const faucetWallet = ethers.HDNodeWallet.fromPhrase(
    config.blockchain.sender.mnemonic,
    undefined,
    pathToString(config.blockchain.sender.option.hdPaths[0])
  ).connect(ethers.provider);

  console.log("Faucet Address:", faucetWallet.address);

  try {
    // Load AtomicMultiSend ABI
    const atomicMultiSendABI = JSON.parse(fs.readFileSync('./deployments/AtomicMultiSend.abi.json', 'utf8'));
    const atomicMultiSend = new ethers.Contract(atomicMultiSendAddress, atomicMultiSendABI, faucetWallet);

    // ERC20 ABI for token transfers
    const erc20ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)"
    ];

    console.log("\n🏦 Funding contract with tokens...");

    // Fund each ERC20 token
    for (const tokenConfig of config.blockchain.tx.amounts) {
      if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        // Native token - send directly to contract
        console.log(`\n💎 Funding native token (${tokenConfig.denom})...`);
        const fundAmount = ethers.parseUnits("10000", tokenConfig.decimals); // 10k tokens
        
        const tx = await faucetWallet.sendTransaction({
          to: atomicMultiSendAddress,
          value: fundAmount,
          gasLimit: 100000
        });
        
        await tx.wait();
        console.log(`✅ Sent ${ethers.formatUnits(fundAmount, tokenConfig.decimals)} ${tokenConfig.denom} (native)`);
        
      } else {
        // ERC20 token
        console.log(`\n🪙 Funding ${tokenConfig.denom}...`);
        const tokenContract = new ethers.Contract(tokenConfig.erc20_contract, erc20ABI, faucetWallet);
        
        // Check current balance
        const balance = await tokenContract.balanceOf(faucetWallet.address);
        console.log(`Faucet ${tokenConfig.denom} balance:`, ethers.formatUnits(balance, tokenConfig.decimals));
        
        if (balance === 0n) {
          console.log(`⚠️ Warning: Faucet has no ${tokenConfig.denom} tokens to transfer`);
          continue;
        }
        
        // Transfer 50% of balance to AtomicMultiSend contract
        const transferAmount = balance / 2n;
        console.log(`Transferring ${ethers.formatUnits(transferAmount, tokenConfig.decimals)} ${tokenConfig.denom}...`);
        
        const tx = await tokenContract.transfer(atomicMultiSendAddress, transferAmount);
        await tx.wait();
        
        console.log(`✅ Transferred ${ethers.formatUnits(transferAmount, tokenConfig.decimals)} ${tokenConfig.denom}`);
        
        // Verify transfer
        const contractBalance = await tokenContract.balanceOf(atomicMultiSendAddress);
        console.log(`Contract ${tokenConfig.denom} balance:`, ethers.formatUnits(contractBalance, tokenConfig.decimals));
      }
    }

    console.log("\n📊 FINAL BALANCES:");
    console.log("=".repeat(40));

    // Check all balances
    for (const tokenConfig of config.blockchain.tx.amounts) {
      let balance;
      let tokenSymbol = tokenConfig.denom.toUpperCase();
      
      if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        balance = await ethers.provider.getBalance(atomicMultiSendAddress);
      } else {
        balance = await atomicMultiSend.getBalance(tokenConfig.erc20_contract);
      }
      
      console.log(`${tokenSymbol}: ${ethers.formatUnits(balance, tokenConfig.decimals)}`);
    }

    console.log("\n🎉 FUNDING COMPLETED SUCCESSFULLY!");

  } catch (error) {
    console.error("\n💥 Funding failed:");
    console.error(error);
    process.exit(1);
  }
}

// Export for use in other scripts  
export { main as fundAtomicMultiSend };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}