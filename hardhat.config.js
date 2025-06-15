require("@nomicfoundation/hardhat-ethers");

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
      url: "https://cevm-01-evmrpc.dev.skip.build",
      chainId: 262144, // 0x40000
      gasPrice: 20000000000, // 20 gwei
      gas: 8000000,
      accounts: [
        "dd138b977ac3248b328b7b65ac30338b1482a17197a175f03fd2df20fb0919c6" // Private key for the faucet address
      ],
      timeout: 60000
    },
    hardhat: {
      chainId: 262144
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