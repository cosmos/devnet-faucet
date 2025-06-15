import { ethers } from 'ethers';
import fs from 'fs';
import { execSync } from 'child_process';
import config from '../../config.js';
import { pathToString } from '@cosmjs/crypto';

const { JsonRpcProvider, HDNodeWallet, ContractFactory } = ethers;

async function deployMultiSend() {
  console.log('Deploying new MultiSend contract...');

  // Setup provider and wallet using centralized config
  const provider = new JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
  const wallet = HDNodeWallet.fromPhrase(
    config.blockchain.sender.mnemonic,
    undefined,
    pathToString(config.blockchain.sender.option.hdPaths[0])
  ).connect(provider);

  console.log('Deployer address:', wallet.address);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Deployer balance:', ethers.formatEther(balance), 'ETH');

  try {
    // Compile the contract using solc
    console.log('Compiling contract...');

    const solcCommand = `npx solc --optimize --abi --bin contracts/MultiSend.sol -o build/`;
    execSync(solcCommand, { stdio: 'inherit' });

    // Read compiled contract
    const abi = JSON.parse(fs.readFileSync('build/contracts_MultiSend_sol_MultiSend.abi', 'utf8'));
    const bytecode = fs.readFileSync('build/contracts_MultiSend_sol_MultiSend.bin', 'utf8');

    // Create contract factory
    const contractFactory = new ContractFactory(abi, bytecode, wallet);

    // Deploy contract
    console.log('Deploying contract...');
    const contract = await contractFactory.deploy({
      gasLimit: 2000000,
      gasPrice: ethers.parseUnits('20', 'gwei')
    });

    console.log('Transaction hash:', contract.deploymentTransaction().hash);
    console.log('Waiting for deployment...');

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log('MultiSend contract deployed at:', contractAddress);

    // Save deployment info
    const deploymentInfo = {
      address: contractAddress,
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
      network: config.blockchain.name,
      chainId: (await provider.getNetwork()).chainId.toString(),
      transactionHash: contract.deploymentTransaction().hash
    };

    fs.writeFileSync('deployments/multisend.json', JSON.stringify(deploymentInfo, null, 2));
    console.log('Deployment info saved to deployments/multisend.json');

    return contractAddress;

  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// Run deployment
deployMultiSend().catch(console.error);