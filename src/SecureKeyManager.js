import { keccak_256 } from '@noble/hashes/sha3';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { bech32 } from 'bech32';

const bip32 = BIP32Factory(ecc);

class SecureKeyManager {
  constructor() {
    this._keys = new Map();
    this._addressCache = null;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;

    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
      throw new Error('MNEMONIC environment variable not set. Required for wallet operations.');
    }

    if (!validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase provided');
    }

    const derivationPath = "m/44'/60'/0'/0/0";
    const seed = mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed);
    const node = root.derivePath(derivationPath);

    if (!node.privateKey) {
      throw new Error('Failed to derive private key from mnemonic');
    }

    const privateKeyBytes = node.privateKey;
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
    const publicKeyBytesCompressed = secp256k1.getPublicKey(privateKeyBytes, true);

    const evmAddress = this._deriveEvmAddress(publicKeyBytes);
    const cosmosAddress = this._deriveCosmosAddress(publicKeyBytes);

    this._addressCache = {
      evm: {
        address: evmAddress,
        publicKey: '0x' + Buffer.from(publicKeyBytesCompressed).toString('hex')
      },
      cosmos: {
        address: cosmosAddress,
        publicKey: Buffer.from(publicKeyBytesCompressed).toString('hex')
      }
    };

    this._keys.set('privateKey', privateKeyBytes);
    this._keys.set('publicKey', publicKeyBytesCompressed);
    
    this._initialized = true;
    
    console.log('✅ SecureKeyManager initialized successfully');
    console.log('📍 EVM Address:', evmAddress);
    console.log('📍 Cosmos Address:', cosmosAddress);
  }

  _deriveEvmAddress(publicKeyBytes) {
    const publicKeyWithoutPrefix = publicKeyBytes.slice(1);
    const addressBytes = keccak_256(publicKeyWithoutPrefix).slice(-20);
    return '0x' + Buffer.from(addressBytes).toString('hex');
  }

  _deriveCosmosAddress(publicKeyBytes) {
    // For eth_secp256k1, Cosmos address is derived the same way as EVM address
    // Use the same keccak hash of uncompressed public key (minus 0x04 prefix)
    const publicKeyWithoutPrefix = publicKeyBytes.slice(1);
    const addressBytes = keccak_256(publicKeyWithoutPrefix).slice(-20);
    const words = bech32.toWords(addressBytes);
    return bech32.encode('cosmos', words);
  }

  getPrivateKeyHex() {
    this._ensureInitialized();
    const privateKey = this._keys.get('privateKey');
    return '0x' + Buffer.from(privateKey).toString('hex');
  }

  getPrivateKeyBytes() {
    this._ensureInitialized();
    return this._keys.get('privateKey');
  }

  getPublicKeyBytes() {
    this._ensureInitialized();
    return this._keys.get('publicKey');
  }

  getAddresses() {
    this._ensureInitialized();
    return this._addressCache;
  }

  getEvmAddress() {
    this._ensureInitialized();
    return this._addressCache.evm.address;
  }

  getCosmosAddress() {
    this._ensureInitialized();
    return this._addressCache.cosmos.address;
  }

  getEvmPublicKey() {
    this._ensureInitialized();
    return this._addressCache.evm.publicKey;
  }

  validateAddresses(expectedAddresses) {
    this._ensureInitialized();
    
    const current = this._addressCache;
    const errors = [];

    if (expectedAddresses.evm && expectedAddresses.evm !== current.evm.address) {
      errors.push(`EVM address mismatch: expected ${expectedAddresses.evm}, got ${current.evm.address}`);
    }

    if (expectedAddresses.cosmos && expectedAddresses.cosmos !== current.cosmos.address) {
      errors.push(`Cosmos address mismatch: expected ${expectedAddresses.cosmos}, got ${current.cosmos.address}`);
    }

    if (errors.length > 0) {
      throw new Error('Address validation failed:\n' + errors.join('\n'));
    }

    console.log('✅ Address validation successful');
    return true;
  }

  clearSensitiveData() {
    if (this._keys.has('privateKey')) {
      const privateKey = this._keys.get('privateKey');
      privateKey.fill(0);
    }
    
    this._keys.clear();
    this._initialized = false;
    
    console.log('🔒 Sensitive key data cleared from memory');
  }

  _ensureInitialized() {
    if (!this._initialized) {
      throw new Error('SecureKeyManager not initialized. Call initialize() first.');
    }
  }
}

export default new SecureKeyManager();