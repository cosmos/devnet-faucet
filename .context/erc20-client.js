const { DirectSecp256k1HdWallet, Registry } = require('@cosmjs/proto-signing');
const { SigningStargateClient, GasPrice } = require('@cosmjs/stargate');
const { MsgConvertERC20, MsgConvertCoin, MsgRegisterERC20 } = require('@cosmjs/stargate');
const Web3 = require('web3');
const { Transaction, FeeMarketEIPTransaction, AccessListEIPTransaction } = require('@ethereumjs/tx');
const { Common } = require('@ethereumjs/common');
const { keccak256 } = require('js-sha3');
const { bech32 } = require('bech32');

/**
 * ERC20 Token Registration and Conversion Client
 * Supports both Cosmos and EVM signers with eth_secp256k1 keytype
 */
class ERC20Client {
  constructor(config = {}) {
    this.config = {
      chainId: config.chainId || 4221,
      cosmosChainId: config.cosmosChainId || 'evm-chain',
      bech32Prefix: config.bech32Prefix || 'cosmos',
      rpcEndpoint: config.rpcEndpoint || 'http://127.0.0.1:26657',
      evmRpcEndpoint: config.evmRpcEndpoint || 'http://127.0.0.1:8545',
      gasPrice: config.gasPrice || GasPrice.fromString('0.025aatom'),
      ...config
    };

    this.web3 = new Web3(this.config.evmRpcEndpoint);
    this.common = Common.custom({
      chainId: this.config.chainId,
      networkId: this.config.chainId
    });
  }

  /**
   * Convert hex address to bech32 address (no ripemd160 hashing)
   * Direct conversion as mentioned in requirements
   */
  hexToBech32(hexAddress) {
    // Remove 0x prefix if present
    const hex = hexAddress.replace('0x', '');
    
    // Convert hex string to bytes
    const addressBytes = Buffer.from(hex, 'hex');
    
    // Direct conversion without ripemd160 hashing
    const words = bech32.toWords(addressBytes);
    return bech32.encode(this.config.bech32Prefix, words);
  }

  /**
   * Convert bech32 address to hex address
   */
  bech32ToHex(bech32Address) {
    const decoded = bech32.decode(bech32Address);
    const addressBytes = bech32.fromWords(decoded.words);
    return '0x' + Buffer.from(addressBytes).toString('hex');
  }

  /**
   * Derive Ethereum-style address from eth_secp256k1 public key
   */
  deriveAddressFromPubkey(publicKey) {
    // Remove 0x04 prefix if uncompressed, or handle compressed format
    let pubKeyBytes;
    if (publicKey.length === 130) { // Uncompressed (0x04 + 64 bytes)
      pubKeyBytes = Buffer.from(publicKey.slice(4), 'hex');
    } else if (publicKey.length === 66) { // Compressed (0x02/0x03 + 32 bytes)
      // For compressed keys, we need to decompress first
      // This is a simplified version - you may need secp256k1 library for full decompression
      throw new Error('Compressed public key handling requires secp256k1 library');
    } else {
      pubKeyBytes = Buffer.from(publicKey, 'hex');
    }

    // Keccak256 hash of public key (64 bytes)
    const hash = keccak256(pubKeyBytes);
    
    // Take first 20 bytes as address
    const address = '0x' + hash.slice(-40);
    return address;
  }

  /**
   * Register ERC20 token using Cosmos signer
   */
  async registerERC20WithCosmos(mnemonic, contractAddresses, options = {}) {
    try {
      // Create wallet from mnemonic with custom prefix
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: this.config.bech32Prefix,
        hdPaths: [options.hdPath || "m/44'/60'/0'/0/0"] // Ethereum derivation path for eth_secp256k1
      });

      // Get accounts
      const accounts = await wallet.getAccounts();
      const signerAddress = accounts[0].address;

      // Create signing client
      const client = await SigningStargateClient.connectWithSigner(
        this.config.rpcEndpoint,
        wallet,
        {
          gasPrice: this.config.gasPrice,
        }
      );

      // Prepare register message
      const registerMsg = {
        typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
        value: {
          signer: signerAddress,
          erc20addresses: Array.isArray(contractAddresses) ? contractAddresses : [contractAddresses]
        }
      };

      // Estimate and send transaction
      const fee = await client.simulate(signerAddress, [registerMsg], options.memo || '');
      const gasLimit = Math.floor(fee * 1.3); // 30% buffer

      const result = await client.signAndBroadcast(
        signerAddress,
        [registerMsg],
        {
          amount: [{ denom: 'aatom', amount: String(Math.floor(gasLimit * parseFloat(this.config.gasPrice.amount))) }],
          gas: gasLimit.toString()
        },
        options.memo || 'Register ERC20 tokens'
      );

      return {
        success: true,
        txHash: result.transactionHash,
        gasUsed: result.gasUsed,
        events: result.events
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * Convert ERC20 to Cosmos coin using Cosmos signer
   */
  async convertERC20ToCoin(mnemonic, contractAddress, amount, receiverAddress, options = {}) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: this.config.bech32Prefix,
        hdPaths: [options.hdPath || "m/44'/60'/0'/0/0"]
      });

      const accounts = await wallet.getAccounts();
      const signerAddress = accounts[0].address;
      const senderHex = this.bech32ToHex(signerAddress);

      const client = await SigningStargateClient.connectWithSigner(
        this.config.rpcEndpoint,
        wallet,
        { gasPrice: this.config.gasPrice }
      );

      const convertMsg = {
        typeUrl: '/cosmos.evm.erc20.v1.MsgConvertERC20',
        value: {
          contractAddress: contractAddress,
          amount: amount.toString(),
          receiver: receiverAddress || signerAddress,
          sender: senderHex
        }
      };

      const fee = await client.simulate(signerAddress, [convertMsg], options.memo || '');
      const gasLimit = Math.floor(fee * 1.3);

      const result = await client.signAndBroadcast(
        signerAddress,
        [convertMsg],
        {
          amount: [{ denom: 'aatom', amount: String(Math.floor(gasLimit * parseFloat(this.config.gasPrice.amount))) }],
          gas: gasLimit.toString()
        },
        options.memo || 'Convert ERC20 to Cosmos coin'
      );

      return {
        success: true,
        txHash: result.transactionHash,
        gasUsed: result.gasUsed,
        events: result.events
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * Convert Cosmos coin to ERC20 using Cosmos signer
   */
  async convertCoinToERC20(mnemonic, coinDenom, amount, receiverHexAddress, options = {}) {
    try {
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: this.config.bech32Prefix,
        hdPaths: [options.hdPath || "m/44'/60'/0'/0/0"]
      });

      const accounts = await wallet.getAccounts();
      const signerAddress = accounts[0].address;
      const receiverHex = receiverHexAddress || this.bech32ToHex(signerAddress);

      const client = await SigningStargateClient.connectWithSigner(
        this.config.rpcEndpoint,
        wallet,
        { gasPrice: this.config.gasPrice }
      );

      const convertMsg = {
        typeUrl: '/cosmos.evm.erc20.v1.MsgConvertCoin',
        value: {
          coin: {
            denom: coinDenom,
            amount: amount.toString()
          },
          receiver: receiverHex,
          sender: signerAddress
        }
      };

      const fee = await client.simulate(signerAddress, [convertMsg], options.memo || '');
      const gasLimit = Math.floor(fee * 1.3);

      const result = await client.signAndBroadcast(
        signerAddress,
        [convertMsg],
        {
          amount: [{ denom: 'aatom', amount: String(Math.floor(gasLimit * parseFloat(this.config.gasPrice.amount))) }],
          gas: gasLimit.toString()
        },
        options.memo || 'Convert Cosmos coin to ERC20'
      );

      return {
        success: true,
        txHash: result.transactionHash,
        gasUsed: result.gasUsed,
        events: result.events
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * Register ERC20 using EVM signer (via Ethereum transaction to precompile)
   */
  async registerERC20WithEVM(privateKey, contractAddresses, options = {}) {
    try {
      // This would typically require a governance transaction or authority call
      // For demonstration, showing how to interact with a hypothetical registration precompile
      
      const account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
      const fromAddress = account.address;

      // Registration would typically be done via governance
      // Here showing how to construct the transaction if there were a precompile
      const registrationPrecompileAddress = '0x0000000000000000000000000000000000000800'; // Hypothetical
      
      // ABI for registration (hypothetical)
      const registrationABI = [{
        "name": "registerTokens",
        "type": "function",
        "inputs": [{"name": "tokens", "type": "address[]"}],
        "outputs": [{"name": "success", "type": "bool"}]
      }];

      const contract = new this.web3.eth.Contract(registrationABI, registrationPrecompileAddress);
      const data = contract.methods.registerTokens(
        Array.isArray(contractAddresses) ? contractAddresses : [contractAddresses]
      ).encodeABI();

      const nonce = await this.web3.eth.getTransactionCount(fromAddress);
      const gasPrice = await this.web3.eth.getGasPrice();

      const txData = {
        nonce: this.web3.utils.toHex(nonce),
        gasPrice: this.web3.utils.toHex(gasPrice),
        gasLimit: this.web3.utils.toHex(options.gasLimit || 100000),
        to: registrationPrecompileAddress,
        value: '0x0',
        data: data,
        chainId: this.config.chainId
      };

      // Sign transaction
      const tx = FeeMarketEIPTransaction.fromTxData(txData, { common: this.common });
      const signedTx = tx.sign(Buffer.from(privateKey.replace('0x', ''), 'hex'));

      // Send transaction
      const receipt = await this.web3.eth.sendSignedTransaction('0x' + signedTx.serialize().toString('hex'));

      return {
        success: true,
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * Interact with ERC20 precompile directly
   */
  async callERC20Precompile(privateKey, precompileAddress, method, params = [], options = {}) {
    try {
      const account = this.web3.eth.accounts.privateKeyToAccount(privateKey);
      const fromAddress = account.address;

      // Standard ERC20 ABI methods
      const erc20ABI = [
        {"name": "transfer", "type": "function", "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}], "outputs": [{"name": "success", "type": "bool"}]},
        {"name": "approve", "type": "function", "inputs": [{"name": "spender", "type": "address"}, {"name": "value", "type": "uint256"}], "outputs": [{"name": "success", "type": "bool"}]},
        {"name": "balanceOf", "type": "function", "inputs": [{"name": "owner", "type": "address"}], "outputs": [{"name": "balance", "type": "uint256"}]},
        {"name": "totalSupply", "type": "function", "inputs": [], "outputs": [{"name": "supply", "type": "uint256"}]},
        {"name": "allowance", "type": "function", "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}], "outputs": [{"name": "remaining", "type": "uint256"}]}
      ];

      const contract = new this.web3.eth.Contract(erc20ABI, precompileAddress);
      
      // For read-only methods
      if (['balanceOf', 'totalSupply', 'allowance', 'name', 'symbol', 'decimals'].includes(method)) {
        const result = await contract.methods[method](...params).call({ from: fromAddress });
        return { success: true, result };
      }

      // For state-changing methods
      const data = contract.methods[method](...params).encodeABI();
      const nonce = await this.web3.eth.getTransactionCount(fromAddress);
      const gasPrice = await this.web3.eth.getGasPrice();

      const txData = {
        nonce: this.web3.utils.toHex(nonce),
        gasPrice: this.web3.utils.toHex(gasPrice),
        gasLimit: this.web3.utils.toHex(options.gasLimit || 50000),
        to: precompileAddress,
        value: '0x0',
        data: data,
        chainId: this.config.chainId
      };

      const tx = FeeMarketEIPTransaction.fromTxData(txData, { common: this.common });
      const signedTx = tx.sign(Buffer.from(privateKey.replace('0x', ''), 'hex'));

      const receipt = await this.web3.eth.sendSignedTransaction('0x' + signedTx.serialize().toString('hex'));

      return {
        success: true,
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * Query token pairs
   */
  async queryTokenPairs() {
    try {
      const response = await fetch(`${this.config.rpcEndpoint}/cosmos/evm/erc20/v1/token_pairs`);
      const data = await response.json();
      return {
        success: true,
        tokenPairs: data.token_pairs || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Query specific token pair
   */
  async queryTokenPair(tokenIdentifier) {
    try {
      const response = await fetch(`${this.config.rpcEndpoint}/cosmos/evm/erc20/v1/token_pairs/${tokenIdentifier}`);
      const data = await response.json();
      return {
        success: true,
        tokenPair: data.token_pair
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate mnemonic for eth_secp256k1 keytype
   */
  static async generateMnemonic() {
    const wallet = await DirectSecp256k1HdWallet.generate(24);
    return wallet.mnemonic;
  }

  /**
   * Derive addresses from mnemonic
   */
  async deriveAddresses(mnemonic, hdPath = "m/44'/60'/0'/0/0") {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: this.config.bech32Prefix,
      hdPaths: [hdPath]
    });

    const accounts = await wallet.getAccounts();
    const cosmosAddress = accounts[0].address;
    const hexAddress = this.bech32ToHex(cosmosAddress);

    return {
      cosmosAddress,
      hexAddress,
      publicKey: Buffer.from(accounts[0].pubkey).toString('hex')
    };
  }
}

module.exports = { ERC20Client };