#!/usr/bin/env node

/**
 * Wrap ATOM to WATOM for faucet distribution
 */

import { ethers } from 'ethers';
import config from '../config.js';
import { pathToString } from '@cosmjs/crypto';

// Generate faucet wallet from config
const faucetWallet = ethers.HDNodeWallet.fromPhrase(
  config.blockchain.sender.mnemonic,
  undefined,
  pathToString(config.blockchain.sender.option.hdPaths[0])
);

const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
const wallet = new ethers.Wallet(faucetWallet.privateKey, provider);

const WERC20_ADDRESS = '0x0000000000000000000000000000000000000802';

// WERC20 ABI (from precompile)
const WERC20_ABI = [
  {
    "inputs": [],
    "name": "deposit",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "wad",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function wrapAtomForFaucet() {
  console.log('='.repeat(60));
  console.log('WRAPPING ATOM FOR FAUCET DISTRIBUTION');
  console.log('='.repeat(60));
  console.log('Faucet Address:', wallet.address);
  console.log('WERC20 Address:', WERC20_ADDRESS);

  try {
    // Get current balances
    const nativeBalance = await provider.getBalance(wallet.address);
    console.log('Native ATOM Balance:', ethers.formatEther(nativeBalance), 'ATOM');

    const werc20 = new ethers.Contract(WERC20_ADDRESS, WERC20_ABI, wallet);
    
    let watomBalance;
    try {
      watomBalance = await werc20.balanceOf(wallet.address);
      console.log('Current WATOM Balance:', ethers.formatUnits(watomBalance, 6), 'WATOM');
    } catch (error) {
      console.log('Could not read WATOM balance (contract may not support standard calls)');
      watomBalance = 0n;
    }

    // Amount to wrap (100,000 ATOM worth)
    const wrapAmount = ethers.parseUnits('100000', 6); // 6 decimals for ATOM
    console.log('Amount to wrap:', ethers.formatUnits(wrapAmount, 6), 'ATOM');

    if (nativeBalance < wrapAmount) {
      throw new Error(`Insufficient native balance. Have: ${ethers.formatEther(nativeBalance)}, Need: ${ethers.formatUnits(wrapAmount, 6)}`);
    }

    // Wrap ATOM by calling deposit function with value
    console.log('\n📝 Wrapping ATOM to WATOM...');
    const depositTx = await werc20.deposit({ 
      value: wrapAmount,
      gasLimit: 200000
    });
    
    console.log('⏳ Transaction hash:', depositTx.hash);
    const receipt = await depositTx.wait();
    console.log('✅ Wrap confirmed in block:', receipt.blockNumber);
    console.log('⛽ Gas used:', receipt.gasUsed.toString());

    // Check new balance
    try {
      const newWatomBalance = await werc20.balanceOf(wallet.address);
      console.log('✅ New WATOM Balance:', ethers.formatUnits(newWatomBalance, 6), 'WATOM');
    } catch (error) {
      console.log('Could not verify new WATOM balance');
    }

    // Now approve AtomicMultiSend to spend WATOM
    console.log('\n📝 Approving AtomicMultiSend to spend WATOM...');
    const atomicMultiSendAddress = config.blockchain.contracts.atomicMultiSend;
    const approvalAmount = ethers.parseUnits('1000000', 6); // 1M WATOM approval

    const approveTx = await werc20.approve(atomicMultiSendAddress, approvalAmount, {
      gasLimit: 100000
    });
    
    console.log('⏳ Approval transaction hash:', approveTx.hash);
    const approvalReceipt = await approveTx.wait();
    console.log('✅ Approval confirmed in block:', approvalReceipt.blockNumber);

    // Verify approval
    try {
      const allowance = await werc20.allowance(wallet.address, atomicMultiSendAddress);
      console.log('✅ WATOM Allowance for AtomicMultiSend:', ethers.formatUnits(allowance, 6), 'WATOM');
    } catch (error) {
      console.log('Could not verify allowance');
    }

    console.log('\n🎉 WATOM wrapping and approval completed successfully!');
    console.log('The faucet can now distribute WATOM tokens.');

    return {
      wrapTx: depositTx.hash,
      approveTx: approveTx.hash,
      amount: ethers.formatUnits(wrapAmount, 6)
    };

  } catch (error) {
    console.error('❌ Error wrapping ATOM:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  wrapAtomForFaucet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Wrapping failed:', error);
      process.exit(1);
    });
}

export { wrapAtomForFaucet };