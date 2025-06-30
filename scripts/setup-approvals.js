#!/usr/bin/env node

/**
 * Comprehensive Token Approval Management Script
 * 
 * This script provides flexible management of ERC20 token approvals for the AtomicMultiSend contract.
 * 
 * Usage:
 *   node scripts/setup-approvals.js check                    - Check all token approvals
 *   node scripts/setup-approvals.js check WBTC              - Check specific token approval
 *   node scripts/setup-approvals.js approve                  - Approve all tokens to default amounts
 *   node scripts/setup-approvals.js approve WBTC            - Approve specific token to default amount
 *   node scripts/setup-approvals.js approve WBTC 50000      - Approve specific amount for specific token
 *   node scripts/setup-approvals.js approve-max             - Approve maximum amount for all tokens
 *   node scripts/setup-approvals.js approve-max WBTC        - Approve maximum amount for specific token
 *   node scripts/setup-approvals.js revoke                   - Revoke all approvals (set to 0)
 *   node scripts/setup-approvals.js revoke WBTC             - Revoke approval for specific token
 *   node scripts/setup-approvals.js balance                  - Check balances for all tokens
 *   node scripts/setup-approvals.js help                     - Show this help message
 */

import { ethers } from 'ethers';
import config, { getEvmAddress, getPrivateKey, initializeSecureKeys } from '../config.js';
import TokenConfigLoader from '../src/TokenConfigLoader.js';
import fs from 'fs';
import path from 'path';

// ERC20 ABI for approval management
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function name() external view returns (string)',
  'function totalSupply() external view returns (uint256)'
];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatAmount(amount, decimals, symbol) {
  const formatted = ethers.formatUnits(amount, decimals);
  return `${formatted} ${symbol}`;
}

async function getTokenInfo(tokenContract, tokenConfig) {
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      tokenContract.name().catch(() => tokenConfig.name),
      tokenContract.symbol().catch(() => tokenConfig.symbol),
      tokenContract.decimals().catch(() => tokenConfig.decimals),
      tokenContract.totalSupply().catch(() => '0')
    ]);
    return { name, symbol, decimals, totalSupply };
  } catch (error) {
    return {
      name: tokenConfig.name,
      symbol: tokenConfig.symbol,
      decimals: tokenConfig.decimals,
      totalSupply: '0'
    };
  }
}

async function checkTokenApproval(wallet, tokenConfig, atomicMultiSendAddress) {
  const tokenContract = new ethers.Contract(
    tokenConfig.erc20_contract,
    ERC20_ABI,
    wallet
  );

  const tokenInfo = await getTokenInfo(tokenContract, tokenConfig);
  const [balance, allowance] = await Promise.all([
    tokenContract.balanceOf(wallet.address),
    tokenContract.allowance(wallet.address, atomicMultiSendAddress)
  ]);

  return {
    ...tokenConfig,
    ...tokenInfo,
    balance,
    allowance,
    contract: tokenContract
  };
}

async function checkAllApprovals(wallet, atomicMultiSendAddress, specificToken = null) {
  log('\n=== CHECKING TOKEN APPROVALS ===', 'bright');
  
  // Load token configuration
  const networkConfig = {
    name: config.blockchain.name,
    chainId: config.blockchain.ids.chainId,
    cosmosChainId: config.blockchain.ids.cosmosChainId,
    type: config.blockchain.type
  };
  const tokenLoader = new TokenConfigLoader(networkConfig);
  const tokens = tokenLoader.getErc20Tokens();

  const results = [];
  
  for (const token of tokens) {
    // Skip if we're looking for a specific token and this isn't it
    if (specificToken && 
        token.symbol.toUpperCase() !== specificToken.toUpperCase() &&
        token.erc20_contract.toLowerCase() !== specificToken.toLowerCase()) {
      continue;
    }

    try {
      const info = await checkTokenApproval(wallet, token, atomicMultiSendAddress);
      results.push(info);
      
      log(`\n${info.name} (${info.symbol})`, 'cyan');
      log(`  Contract: ${info.erc20_contract}`, 'dim');
      log(`  Decimals: ${info.decimals}`);
      log(`  Total Supply: ${formatAmount(info.totalSupply, info.decimals, info.symbol)}`);
      log(`  Your Balance: ${formatAmount(info.balance, info.decimals, info.symbol)}`, 
          info.balance > 0 ? 'green' : 'yellow');
      log(`  Current Allowance: ${formatAmount(info.allowance, info.decimals, info.symbol)}`,
          info.allowance > 0 ? 'green' : 'red');
      
      // Check if allowance is sufficient for faucet operations
      const faucetAmount = ethers.parseUnits(
        (info.amount || info.target_balance || '1000000000000000000').toString(),
        info.decimals
      );
      const requiredAllowance = faucetAmount * 100n; // 100 faucet requests worth
      
      if (info.allowance < requiredAllowance) {
        log(`    Allowance may be insufficient for continuous operation`, 'yellow');
        log(`      Recommended: ${formatAmount(requiredAllowance, info.decimals, info.symbol)}`, 'dim');
      } else {
        log(`  ✓ Allowance sufficient for ~${info.allowance / faucetAmount} faucet requests`, 'green');
      }
    } catch (error) {
      log(`\n${token.name} (${token.symbol})`, 'cyan');
      log(`  Contract: ${token.erc20_contract}`, 'dim');
      log(`   Error: ${error.message}`, 'red');
      results.push({ ...token, error: error.message });
    }
  }

  if (specificToken && results.length === 0) {
    log(`\n Token "${specificToken}" not found in configuration`, 'red');
  }

  return results;
}

async function approveTokens(wallet, atomicMultiSendAddress, specificToken = null, specificAmount = null, maxApproval = false) {
  log('\n=== APPROVING TOKENS ===', 'bright');
  
  // Load token configuration
  const networkConfig = {
    name: config.blockchain.name,
    chainId: config.blockchain.ids.chainId,
    cosmosChainId: config.blockchain.ids.cosmosChainId,
    type: config.blockchain.type
  };
  const tokenLoader = new TokenConfigLoader(networkConfig);
  const tokens = tokenLoader.getErc20Tokens();

  const results = [];
  
  for (const token of tokens) {
    // Skip if we're looking for a specific token and this isn't it
    if (specificToken && 
        token.symbol.toUpperCase() !== specificToken.toUpperCase() &&
        token.erc20_contract.toLowerCase() !== specificToken.toLowerCase()) {
      continue;
    }

    try {
      const info = await checkTokenApproval(wallet, token, atomicMultiSendAddress);
      
      log(`\n${info.name} (${info.symbol})`, 'cyan');
      log(`  Current Allowance: ${formatAmount(info.allowance, info.decimals, info.symbol)}`);
      
      // Determine approval amount
      let approvalAmount;
      if (maxApproval) {
        approvalAmount = ethers.MaxUint256;
        log(`  Setting maximum approval...`, 'yellow');
      } else if (specificAmount) {
        approvalAmount = ethers.parseUnits(specificAmount, info.decimals);
        log(`  Approving ${formatAmount(approvalAmount, info.decimals, info.symbol)}...`, 'yellow');
      } else {
        // Default: approve for 1 million tokens or 1000x faucet amount, whichever is larger
        const millionTokens = ethers.parseUnits('1000000', info.decimals);
        const faucetAmount = ethers.parseUnits(
          (info.amount || info.target_balance || '1000000000000000000').toString(),
          info.decimals
        );
        const thousandFaucetRequests = faucetAmount * 1000n;
        approvalAmount = millionTokens > thousandFaucetRequests ? millionTokens : thousandFaucetRequests;
        log(`  Approving ${formatAmount(approvalAmount, info.decimals, info.symbol)} (default)...`, 'yellow');
      }
      
      // Check if approval is needed
      if (info.allowance >= approvalAmount) {
        log(`  ✓ Allowance already sufficient`, 'green');
        results.push({
          token: info.symbol,
          address: info.contract.address,
          status: 'sufficient',
          allowance: formatAmount(info.allowance, info.decimals, info.symbol)
        });
        continue;
      }

      // Execute approval
      const tx = await info.contract.approve(atomicMultiSendAddress, approvalAmount);
      log(`  Transaction: ${tx.hash}`, 'dim');
      
      const receipt = await tx.wait();
      log(`  ✓ Confirmed in block ${receipt.blockNumber}`, 'green');
      
      // Verify new allowance
      const newAllowance = await info.contract.allowance(wallet.address, atomicMultiSendAddress);
      log(`  New Allowance: ${formatAmount(newAllowance, info.decimals, info.symbol)}`, 'green');
      
      results.push({
        token: info.symbol,
        address: info.contract.address,
        status: 'approved',
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        allowance: formatAmount(newAllowance, info.decimals, info.symbol)
      });
    } catch (error) {
      log(`   Error: ${error.message}`, 'red');
      results.push({
        token: token.symbol,
        address: token.erc20_contract,
        status: 'error',
        error: error.message
      });
    }
  }

  if (specificToken && results.length === 0) {
    log(`\n Token "${specificToken}" not found in configuration`, 'red');
  }

  return results;
}

async function revokeApprovals(wallet, atomicMultiSendAddress, specificToken = null) {
  log('\n=== REVOKING TOKEN APPROVALS ===', 'bright');
  log('Setting all allowances to 0...', 'yellow');
  
  return approveTokens(wallet, atomicMultiSendAddress, specificToken, '0', false);
}

async function checkBalances(wallet) {
  log('\n=== CHECKING TOKEN BALANCES ===', 'bright');
  
  // Load token configuration
  const networkConfig = {
    name: config.blockchain.name,
    chainId: config.blockchain.ids.chainId,
    cosmosChainId: config.blockchain.ids.cosmosChainId,
    type: config.blockchain.type
  };
  const tokenLoader = new TokenConfigLoader(networkConfig);
  const tokens = tokenLoader.getErc20Tokens();

  // Check native balance
  const nativeBalance = await wallet.provider.getBalance(wallet.address);
  log(`\nNative Balance (ETH/ATOM): ${ethers.formatEther(nativeBalance)} ETH`, 
      nativeBalance > 0 ? 'green' : 'yellow');

  // Check ERC20 balances
  for (const token of tokens) {
    try {
      const tokenContract = new ethers.Contract(
        token.erc20_contract,
        ERC20_ABI,
        wallet
      );
      
      const [balance, decimals, symbol] = await Promise.all([
        tokenContract.balanceOf(wallet.address),
        tokenContract.decimals().catch(() => token.decimals),
        tokenContract.symbol().catch(() => token.symbol)
      ]);
      
      log(`\n${token.name} (${symbol})`, 'cyan');
      log(`  Balance: ${formatAmount(balance, decimals, symbol)}`, 
          balance > 0 ? 'green' : 'yellow');
      
      // Compare with faucet amount
      const faucetAmount = ethers.parseUnits(
        (token.amount || token.target_balance || '1000000000000000000').toString(),
        decimals
      );
      const faucetRequests = balance > 0 ? balance / faucetAmount : 0n;
      
      if (faucetRequests > 0) {
        log(`  Sufficient for ~${faucetRequests} faucet requests`, 'dim');
      } else {
        log(`    Insufficient balance for faucet operations`, 'yellow');
      }
    } catch (error) {
      log(`\n${token.name} (${token.symbol})`, 'cyan');
      log(`   Error: ${error.message}`, 'red');
    }
  }
}

function showHelp() {
  log('\n=== Token Approval Management Script ===', 'bright');
  log('\nThis script manages ERC20 token approvals for the AtomicMultiSend contract.\n');
  
  log('USAGE:', 'cyan');
  log('  node scripts/setup-approvals.js <command> [token] [amount]\n');
  
  log('COMMANDS:', 'cyan');
  log('  check [token]           Check approval status for all tokens or specific token');
  log('  approve [token] [amt]   Approve tokens (default: 1M tokens or 1000x faucet amount)');
  log('  approve-max [token]     Approve maximum amount (2^256-1) for tokens');
  log('  revoke [token]          Revoke approvals (set to 0)');
  log('  balance                 Check token balances in faucet wallet');
  log('  help                    Show this help message\n');
  
  log('EXAMPLES:', 'cyan');
  log('  node scripts/setup-approvals.js check');
  log('  node scripts/setup-approvals.js check WBTC');
  log('  node scripts/setup-approvals.js approve');
  log('  node scripts/setup-approvals.js approve WBTC');
  log('  node scripts/setup-approvals.js approve WBTC 50000');
  log('  node scripts/setup-approvals.js approve-max');
  log('  node scripts/setup-approvals.js revoke USDT\n');
  
  log('NOTES:', 'yellow');
  log('  - Token can be specified by symbol (WBTC) or contract address');
  log('  - Amounts are specified in human-readable format (e.g., 50000 for 50k tokens)');
  log('  - The script uses the configuration from config.js and tokens.json');
  log('  - Native tokens (ETH/ATOM) do not require approval\n');
}

async function exportReport(results, command) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), `approval-report-${command}-${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    command,
    network: config.blockchain.name,
    atomicMultiSend: config.blockchain.contracts.atomicMultiSend,
    faucetAddress: await getEvmAddress(),
    results
  };
  
  // Custom replacer to handle BigInt
  const replacer = (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, replacer, 2));
  log(`\nReport saved to: ${reportPath}`, 'dim');
}

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase() || 'help';
    const specificToken = args[1] || null;
    const specificAmount = args[2] || null;

    if (command === 'help' || command === '--help' || command === '-h') {
      showHelp();
      process.exit(0);
    }

    // Initialize secure keys
    log('Initializing secure keys...', 'dim');
    await initializeSecureKeys();
    
    const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
    const wallet = new ethers.Wallet(getPrivateKey(), provider);
    const atomicMultiSendAddress = config.blockchain.contracts.atomicMultiSend;
    
    log(`\nNetwork: ${config.blockchain.name}`, 'cyan');
    log(`Faucet Address: ${wallet.address}`);
    log(`AtomicMultiSend: ${atomicMultiSendAddress}`);

    let results;

    switch (command) {
      case 'check':
        results = await checkAllApprovals(wallet, atomicMultiSendAddress, specificToken);
        await exportReport(results, 'check');
        break;

      case 'approve':
        results = await approveTokens(wallet, atomicMultiSendAddress, specificToken, specificAmount, false);
        await exportReport(results, 'approve');
        break;

      case 'approve-max':
        results = await approveTokens(wallet, atomicMultiSendAddress, specificToken, null, true);
        await exportReport(results, 'approve-max');
        break;

      case 'revoke':
        results = await revokeApprovals(wallet, atomicMultiSendAddress, specificToken);
        await exportReport(results, 'revoke');
        break;

      case 'balance':
        await checkBalances(wallet);
        break;

      default:
        log(`\n Unknown command: ${command}`, 'red');
        log('Use "help" to see available commands\n');
        process.exit(1);
    }

    log('\n✓ Operation completed successfully!', 'green');
    
  } catch (error) {
    log(`\n Fatal error: ${error.message}`, 'red');
    if (error.stack) {
      log(error.stack, 'dim');
    }
    process.exit(1);
  }
}

// Execute main function
main();