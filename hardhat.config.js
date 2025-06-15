require("@nomicfoundation/hardhat-ethers");
import config from './config.js';
import { pathToString } from '@cosmjs/crypto';
import { ethers } from 'ethers';

// Generate deployer wallet from centralized config
const deployerWallet = ethers.HDNodeWallet.fromPhrase(
  config.blockchain.sender.mnemonic,
  undefined,
  pathToString(config.blockchain.sender.option.hdPaths[0])
);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: "istanbul"
    }
  },
  networks: {
    cosmos_evm: {
      url: config.blockchain.endpoints.evm_endpoint,
      chainId: config.blockchain.ids.chainId,
      gasPrice: 20000000000, // 20 gwei
      gas: 8000000,
      accounts: [
        deployerWallet.privateKey.slice(2) // Remove 0x prefix for hardhat
      ],
      timeout: 60000
    },
    hardhat: {
      chainId: config.blockchain.ids.chainId
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  defaultNetwork: "hardhat"
};