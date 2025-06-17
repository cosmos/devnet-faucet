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
  console.log('NOTE: The WERC20 precompile needs to be properly configured/registered');
  console.log('      This script tests the interface but may fail until precompile is active');

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

    // Amount to wrap (smaller test amount first)
    const wrapAmount = ethers.parseUnits('1', 6); // 1 ATOM for testing
    console.log('Amount to wrap:', ethers.formatUnits(wrapAmount, 6), 'ATOM');

    if (nativeBalance < wrapAmount) {
      throw new Error(`Insufficient native balance. Have: ${ethers.formatEther(nativeBalance)}, Need: ${ethers.formatUnits(wrapAmount, 6)}`);
    }

    // Wrap ATOM by calling deposit function with value
    console.log('\n Wrapping ATOM to WATOM...');
    
    // Use a direct transaction since the precompile may not work with the standard ABI
    const depositTx = await wallet.sendTransaction({
      to: WERC20_ADDRESS,
      value: wrapAmount,
      data: '0xd0e30db0', // deposit() function selector
      gasLimit: 300000
    });
    
    console.log(' Transaction hash:', depositTx.hash);
    const receipt = await depositTx.wait();
    console.log(' Wrap confirmed in block:', receipt.blockNumber);
    console.log(' Gas used:', receipt.gasUsed.toString());

    // Check new balance
    try {
      const newWatomBalance = await werc20.balanceOf(wallet.address);
      console.log(' New WATOM Balance:', ethers.formatUnits(newWatomBalance, 6), 'WATOM');
    } catch (error) {
      console.log('Could not verify new WATOM balance');
    }

    // Now approve AtomicMultiSend to spend WATOM
    console.log('\n Approving AtomicMultiSend to spend WATOM...');
    const atomicMultiSendAddress = config.blockchain.contracts.atomicMultiSend;
    const approvalAmount = ethers.parseUnits('1000000', 6); // 1M WATOM approval

    // Use direct transaction for approval
    const approveData = '0x095ea7b3' + // approve(address,uint256) function selector
                        atomicMultiSendAddress.slice(2).padStart(64, '0') + // spender address
                        approvalAmount.toString(16).padStart(64, '0'); // amount

    const approveTx = await wallet.sendTransaction({
      to: WERC20_ADDRESS,
      data: approveData,
      gasLimit: 100000
    });
    
    console.log(' Approval transaction hash:', approveTx.hash);
    const approvalReceipt = await approveTx.wait();
    console.log(' Approval confirmed in block:', approvalReceipt.blockNumber);

    // Verify approval
    try {
      const allowance = await werc20.allowance(wallet.address, atomicMultiSendAddress);
      console.log(' WATOM Allowance for AtomicMultiSend:', ethers.formatUnits(allowance, 6), 'WATOM');
    } catch (error) {
      console.log('Could not verify allowance');
    }

    console.log('\n WATOM wrapping and approval completed successfully!');
    console.log('The faucet can now distribute WATOM tokens.');
    console.log('\n Next Steps:');
    console.log('1. Add WATOM contract to config.js token amounts');
    console.log('2. Update AtomicMultiSend to handle WATOM transfers');
    console.log('3. Test end-to-end faucet distribution');

    return {
      wrapTx: depositTx.hash,
      approveTx: approveTx.hash,
      amount: ethers.formatUnits(wrapAmount, 6)
    };

  } catch (error) {
    console.error(' Error wrapping ATOM:', error.message);
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