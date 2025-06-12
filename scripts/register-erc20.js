import { HDNodeWallet } from 'ethers';
import { DirectSecp256k1Wallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { pathToString } from '@cosmjs/crypto';
import { bech32 } from 'bech32';
import { fromHex, toHex } from '@cosmjs/encoding';
import config from '../config.js';

const COSMOS_RPC = 'https://cevm-01-rpc.dev.skip.build';
const CHAIN_ID = 'cosmos_262144-1';

// ERC20 contracts to register
const ERC20_CONTRACTS = [
  '0x0312040979E0d6333F537A39b23a5DD6F574dBd8', // wbtc
  '0xE43bdb38aF42C9D61a258ED1c0DE28c82f00BA61', // pepe
  '0x6ba2828b31Dff02B1424B1321B580C7F9D0FbC61'  // usdt
];

/**
 * Convert hex address to bech32 address (ETH-compatible - no ripemd160)
 */
function hexToBech32(hexAddress, prefix) {
  // Remove 0x prefix if present
  const hex = hexAddress.replace('0x', '');

  // Convert hex string to bytes
  const addressBytes = fromHex(hex);

  // Direct conversion without ripemd160 hashing (ETH-compatible)
  const cosmosAddress = bech32.encode(prefix, bech32.toWords(addressBytes));

  return cosmosAddress;
}

/**
 * Convert bech32 address to hex address
 */
function bech32ToHex(bech32Address) {
  const decoded = bech32.decode(bech32Address);
  const addressBytes = bech32.fromWords(decoded.words);
  return '0x' + toHex(addressBytes);
}

/**
 * Derive ETH-compatible cosmos address from EVM wallet
 */
function evmToCosmosAddress(evmWallet, prefix) {
  // Get the EVM address (already keccak256 hash of pubkey, first 20 bytes)
  const evmAddress = evmWallet.address;

  // Convert directly to cosmos address (no additional hashing)
  return hexToBech32(evmAddress, prefix);
}

/**
 * Create ETH-compatible cosmos wallet for eth_secp256k1 chains
 */
async function createEthCompatibleCosmosWallet(mnemonic, options) {
  // Create EVM wallet to get the correct address and private key
  const evmWallet = HDNodeWallet.fromPhrase(mnemonic, undefined, pathToString(options.hdPaths[0]));
  const cosmosAddress = evmToCosmosAddress(evmWallet, options.prefix);

  // Get the private key from the EVM wallet
  const privateKeyBytes = fromHex(evmWallet.privateKey.slice(2));

  // Create DirectSecp256k1Wallet from the private key
  const wallet = await DirectSecp256k1Wallet.fromKey(privateKeyBytes, options.prefix);

  // Verify that our derived address matches what the wallet should have
  console.log('ETH-compatible cosmos address:', cosmosAddress);
  console.log('EVM address:', evmWallet.address);

  // Get the original account from the wallet (has the correct pubkey)
  const originalAccounts = await wallet.getAccounts();
  console.log('Original cosmos address from wallet:', originalAccounts[0].address);
  console.log('Pubkeys match:', Buffer.from(originalAccounts[0].pubkey).toString('hex') === evmWallet.publicKey.slice(2));

  // Return a wallet wrapper that uses the ETH-compatible address but keeps the original pubkey
  return {
    async getAccounts() {
      return [{
        ...originalAccounts[0],  // Keep the original pubkey and other properties
        address: cosmosAddress   // Only override the address
      }];
    },

    async signDirect(signerAddress, signDoc) {
      // Always use the first account for signing (the private key is correct)
      return await wallet.signDirect(originalAccounts[0].address, signDoc);
    },

    async signAmino(signerAddress, signDoc) {
      return await wallet.signAmino(originalAccounts[0].address, signDoc);
    }
  };
}

async function registerERC20Tokens() {
  try {
    console.log('Setting up wallet and client...');

    // Use the proper ETH-compatible derivation approach
    const wallet = await createEthCompatibleCosmosWallet(
      config.blockchain.sender.mnemonic.trim(),
      config.blockchain.sender.option
    );

    const accounts = await wallet.getAccounts();
    const signerAddress = accounts[0].address;

    // Create custom registry for our ERC20 message type
    const registry = new Registry();

    // Register the MsgRegisterERC20 message type
    class MsgRegisterERC20 {
      constructor(data) {
        this.signer = data.signer || '';
        this.erc20addresses = data.erc20addresses || [];
      }

      static create(data) {
        return new MsgRegisterERC20(data);
      }

      static encode(message) {
        // Simple protobuf encoding for our message structure
        const writer = new Uint8Array(1024);
        let offset = 0;

        // Field 1: signer (string)
        if (message.signer) {
          const signerBytes = new TextEncoder().encode(message.signer);
          writer[offset++] = 0x0a; // field 1, wire type 2 (length-delimited)
          writer[offset++] = signerBytes.length;
          writer.set(signerBytes, offset);
          offset += signerBytes.length;
        }

        // Field 2: erc20addresses (repeated string)
        if (message.erc20addresses) {
          for (const address of message.erc20addresses) {
            const addressBytes = new TextEncoder().encode(address);
            writer[offset++] = 0x12; // field 2, wire type 2 (length-delimited)
            writer[offset++] = addressBytes.length;
            writer.set(addressBytes, offset);
            offset += addressBytes.length;
          }
        }

        return { finish: () => writer.slice(0, offset) };
      }

      static decode() {
        throw new Error('Decode not implemented');
      }
    }

    registry.register('/cosmos.evm.erc20.v1.MsgRegisterERC20', MsgRegisterERC20);

    // Create signing client with the wallet directly
    const client = await SigningStargateClient.connectWithSigner(
      COSMOS_RPC,
      wallet,
      {
        registry,
        gasPrice: GasPrice.fromString('20000000000uatom')
      }
    );

    console.log('Connected to chain:', CHAIN_ID);

    // Check current balance
    const balance = await client.getBalance(signerAddress, 'uatom');
    console.log('Current balance:', balance);

    // Create RegisterERC20 message directly
    const registerMsg = {
      typeUrl: '/cosmos.evm.erc20.v1.MsgRegisterERC20',
      value: {
        signer: signerAddress,
        erc20addresses: ERC20_CONTRACTS
      }
    };

    console.log('Registering ERC20 tokens...');
    console.log('ERC20 contracts to register:', ERC20_CONTRACTS);

    const fee = {
      amount: [{ denom: 'uatom', amount: '5000' }],
      gas: '200000'
    };

    let result;
    try {
      // Try normal signAndBroadcast first
      result = await client.signAndBroadcast(
        signerAddress,
        [registerMsg],
        fee,
        'Register ERC20 tokens'
      );
    } catch (error) {
      if (error.message.includes('does not exist on chain')) {
        console.log('Account does not exist, using sequence 0...');

        // For non-existent accounts, manually construct and broadcast the transaction
        const chainId = await client.getChainId();
        const accountNumber = 0;
        const sequence = 0;

        // Sign the transaction manually with known sequence
        const txRaw = await client.sign(
          signerAddress,
          [registerMsg],
          fee,
          'Register ERC20 tokens',
          {
            accountNumber: accountNumber,
            sequence: sequence,
            chainId: chainId
          }
        );

        // Broadcast the signed transaction
        result = await client.broadcastTx(txRaw);
      } else {
        throw error;
      }
    }

    console.log('Registration submitted!');
    console.log('Transaction hash:', result.transactionHash);
    console.log('Gas used:', result.gasUsed);

    if (result.code === 0) {
      console.log('SUCCESS: ERC20 tokens registered');

      // Wait a bit for the registration to be processed
      console.log('Waiting for registration to be processed...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check token pairs
      await checkTokenPairs();
    } else {
      console.error('FAILED:', result.rawLog);
    }

  } catch (error) {
    console.error('Error registering ERC20 tokens:', error);
  }
}

async function checkTokenPairs() {
  try {
    const response = await fetch('https://cevm-01-lcd.dev.skip.build/cosmos/evm/erc20/v1/token_pairs');
    const data = await response.json();

    console.log('Current token pairs:');
    data.token_pairs.forEach(pair => {
      console.log(`- ${pair.denom}: ${pair.erc20_address} (enabled: ${pair.enabled})`);
    });

  } catch (error) {
    console.error('Error checking token pairs:', error);
  }
}

// Run the registration
registerERC20Tokens().catch(console.error);