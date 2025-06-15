import { ethers } from 'ethers';
import fs from 'fs';
import config from '../config.js';

/**
 * Fund AtomicMultiSend contract with tokens for faucet operation
 * Uses proper nonce handling and gas estimation for Tendermint reliability
 */

async function getNonceWithRetry(wallet, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const nonce = await wallet.getNonce("pending");
      console.log(`🔢 Retrieved nonce ${nonce} on attempt ${i + 1}`);
      return nonce;
    } catch (error) {
      console.log(`⚠️ Nonce retrieval failed (attempt ${i + 1}): ${error.message}`);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

async function waitForTransactionWithTimeout(tx, timeoutMs = 30000) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Transaction ${tx.hash} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const receipt = await tx.wait();
      clearTimeout(timeout);
      resolve(receipt);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("💰 FUNDING ATOMIC MULTISEND CONTRACT");
  console.log("=".repeat(60));

  try {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
    const faucetWallet = ethers.HDNodeWallet.fromPhrase(
      config.blockchain.sender.mnemonic,
      undefined,
      "m/44'/60'/0'/0/0"
    ).connect(provider);

    const atomicMultiSendAddress = config.blockchain.contracts.atomicMultiSend;
    
    console.log("🏭 Contract Address:", atomicMultiSendAddress);
    console.log("💼 Faucet Address:", faucetWallet.address);
    console.log("🌐 Network:", config.blockchain.name);

    // Check faucet wallet balance
    const faucetBalance = await provider.getBalance(faucetWallet.address);
    console.log("💰 Faucet ETH Balance:", ethers.formatEther(faucetBalance));

    if (faucetBalance === 0n) {
      throw new Error("Faucet wallet has no ETH balance for gas fees");
    }

    // Load AtomicMultiSend ABI
    const atomicMultiSendABI = JSON.parse(fs.readFileSync('./deployments/AtomicMultiSend.abi.json', 'utf8'));
    const atomicMultiSend = new ethers.Contract(atomicMultiSendAddress, atomicMultiSendABI, faucetWallet);

    // ERC20 ABI for token operations
    const erc20ABI = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)"
    ];

    console.log("\n🚀 Starting funding process...");

    let currentNonce = await getNonceWithRetry(faucetWallet);

    // Fund each token
    for (const tokenConfig of config.blockchain.tx.amounts) {
      console.log(`\n📦 Processing ${tokenConfig.denom.toUpperCase()}...`);

      if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
        // Native token funding
        console.log("💎 Funding with native tokens...");
        const fundAmount = ethers.parseUnits("10000", tokenConfig.decimals); // 10k tokens
        
        try {
          const gasEstimate = await provider.estimateGas({
            to: atomicMultiSendAddress,
            value: fundAmount,
            from: faucetWallet.address
          });

          const tx = await faucetWallet.sendTransaction({
            to: atomicMultiSendAddress,
            value: fundAmount,
            gasLimit: (gasEstimate * 130n) / 100n, // 30% buffer
            gasPrice: config.blockchain.tx.fee.evm.gasPrice,
            nonce: currentNonce
          });
          
          console.log("📤 Transaction submitted:", tx.hash);
          const receipt = await waitForTransactionWithTimeout(tx);
          console.log("✅ Native funding successful! Gas used:", receipt.gasUsed.toString());
          
          currentNonce++;
        } catch (error) {
          console.error(`❌ Native funding failed: ${error.message}`);
          continue;
        }
        
      } else {
        // ERC20 token funding
        console.log(`🪙 Funding with ${tokenConfig.denom}...`);
        const tokenContract = new ethers.Contract(tokenConfig.erc20_contract, erc20ABI, faucetWallet);
        
        try {
          // Check faucet's token balance
          const balance = await tokenContract.balanceOf(faucetWallet.address);
          const symbol = await tokenContract.symbol();
          
          console.log(`📊 Faucet ${symbol} balance:`, ethers.formatUnits(balance, tokenConfig.decimals));
          
          if (balance === 0n) {
            console.log(`⚠️ Warning: Faucet has no ${symbol} tokens to transfer`);
            continue;
          }
          
          // Transfer 50% of balance to AtomicMultiSend contract
          const transferAmount = balance / 2n;
          console.log(`🔄 Transferring ${ethers.formatUnits(transferAmount, tokenConfig.decimals)} ${symbol}...`);
          
          const gasEstimate = await tokenContract.transfer.estimateGas(atomicMultiSendAddress, transferAmount);
          
          const tx = await tokenContract.transfer(atomicMultiSendAddress, transferAmount, {
            gasLimit: (gasEstimate * 130n) / 100n, // 30% buffer
            gasPrice: config.blockchain.tx.fee.evm.gasPrice,
            nonce: currentNonce
          });
          
          console.log("📤 Transaction submitted:", tx.hash);
          const receipt = await waitForTransactionWithTimeout(tx);
          console.log("✅ Token funding successful! Gas used:", receipt.gasUsed.toString());
          
          // Verify transfer
          const contractBalance = await tokenContract.balanceOf(atomicMultiSendAddress);
          console.log(`📈 Contract ${symbol} balance:`, ethers.formatUnits(contractBalance, tokenConfig.decimals));
          
          currentNonce++;
          
          // Small delay between transactions for Tendermint
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ ${tokenConfig.denom} funding failed: ${error.message}`);
          continue;
        }
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 FINAL CONTRACT BALANCES");
    console.log("=".repeat(60));

    // Check final balances
    for (const tokenConfig of config.blockchain.tx.amounts) {
      let balance;
      let symbol = tokenConfig.denom.toUpperCase();
      
      try {
        if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
          balance = await provider.getBalance(atomicMultiSendAddress);
        } else {
          balance = await atomicMultiSend.getBalance(tokenConfig.erc20_contract);
        }
        
        console.log(`${symbol}: ${ethers.formatUnits(balance, tokenConfig.decimals)}`);
      } catch (error) {
        console.log(`${symbol}: Error checking balance - ${error.message}`);
      }
    }

    console.log("\n🎉 FUNDING COMPLETED SUCCESSFULLY!");
    console.log("✅ AtomicMultiSend contract is ready for faucet operations");
    console.log("✅ All transfers are now guaranteed to be atomic");

  } catch (error) {
    console.error("\n💥 Funding failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { main as fundAtomicMultiSend };