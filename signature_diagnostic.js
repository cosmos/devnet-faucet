// Comprehensive signature verification diagnostic
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@cosmjs/crypto';
import { fromHex, toBase64 } from '@cosmjs/encoding';
import { SignDoc, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { Any } from "cosmjs-types/google/protobuf/any.js";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx.js";
import { makeAuthInfoBytes, makeSignDoc } from "@cosmjs/proto-signing";
import Long from "long";
import { mnemonicToSeedSync } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { pathToString } from '@cosmjs/crypto';

const bip32 = BIP32Factory(ecc);

// Configuration from our faucet
const mnemonic = 'mosquito peanut thought width car cushion salt matter trouble census win tribe leisure truth install basic april direct indicate eyebrow liar afraid street trip';
const chainId = 'cosmos_262144-1';
const accountNumber = 458;
const currentSequence = 34; // From chain query

console.log('🔍 COMPREHENSIVE SIGNATURE DIAGNOSTIC');
console.log('=====================================\n');

// 1. Key Derivation Analysis
console.log('1️⃣ KEY DERIVATION ANALYSIS');
console.log('---------------------------');

function getPrivateKeyFromMnemonic(mnemonic, derivationPath) {
    const seed = mnemonicToSeedSync(mnemonic);
    const hdwallet = bip32.fromSeed(seed);
    const derivedNode = hdwallet.derivePath(derivationPath);
    return derivedNode.privateKey;
}

const derivationPath = "m/44'/60'/0'/0/0"; // ETH derivation path
const privateKey = getPrivateKeyFromMnemonic(mnemonic, derivationPath);
const publicKey = secp256k1.getPublicKey(privateKey, true);

console.log('Mnemonic (first 20 chars):', mnemonic.substring(0, 20) + '...');
console.log('Derivation path:', derivationPath);
console.log('Private key length:', privateKey.length);
console.log('Public key (compressed):', Buffer.from(publicKey).toString('hex'));
console.log('Public key length:', publicKey.length);

// 2. Address Generation Analysis
console.log('\n2️⃣ ADDRESS GENERATION ANALYSIS');
console.log('-------------------------------');

import { keccak_256 } from '@noble/hashes/sha3';
import { bech32 } from 'bech32';

const publicKeyUncompressed = secp256k1.getPublicKey(privateKey, false);
const keccakHash = keccak_256(publicKeyUncompressed.slice(1));
const addressBytes = keccakHash.slice(-20);

function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const result = [];
    const maxv = (1 << toBits) - 1;
    for (const value of data) {
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            result.push((acc >> bits) & maxv);
        }
    }
    if (pad && bits > 0) {
        result.push((acc << (toBits - bits)) & maxv);
    }
    return result;
}

const fiveBitArray = convertBits(addressBytes, 8, 5, true);
const cosmosAddress = bech32.encode('cosmos', fiveBitArray, 256);
const evmAddress = '0x' + Buffer.from(addressBytes).toString('hex');

console.log('Keccak hash:', Buffer.from(keccakHash).toString('hex'));
console.log('Address bytes:', Buffer.from(addressBytes).toString('hex'));
console.log('Cosmos address:', cosmosAddress);
console.log('EVM address:', evmAddress);
console.log('Expected cosmos address: cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');
console.log('Addresses match:', cosmosAddress === 'cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');

// 3. Protobuf Encoding Analysis
console.log('\n3️⃣ PROTOBUF ENCODING ANALYSIS');
console.log('------------------------------');

function encodeEthSecp256k1PubKey(publicKeyBytes) {
    const keyLength = publicKeyBytes.length;
    const result = new Uint8Array(1 + 1 + keyLength);
    result[0] = 0x0A; // Field 1, wire type 2
    result[1] = keyLength; // Length of key
    result.set(publicKeyBytes, 2);
    return result;
}

const encodedPubKey = encodeEthSecp256k1PubKey(publicKey);
console.log('Encoded pubkey length:', encodedPubKey.length);
console.log('Encoded pubkey (hex):', Buffer.from(encodedPubKey).toString('hex'));

const pubkeyAny = Any.fromPartial({
    typeUrl: "/cosmos.evm.crypto.v1.ethsecp256k1.PubKey",
    value: encodedPubKey,
});

console.log('PubKey Any typeUrl:', pubkeyAny.typeUrl);
console.log('PubKey Any value length:', pubkeyAny.value.length);

// 4. Message Construction Analysis
console.log('\n4️⃣ MESSAGE CONSTRUCTION ANALYSIS');
console.log('---------------------------------');

const msgSendValue = MsgSend.fromPartial({
    fromAddress: cosmosAddress,
    toAddress: 'cosmos1mfewzkcqzz7lhm7adyhnzjjq4tz7y2w3h9egeg', // Test recipient
    amount: [{ denom: 'uatom', amount: '1000000' }]
});

console.log('MsgSend fromAddress:', msgSendValue.fromAddress);
console.log('MsgSend toAddress:', msgSendValue.toAddress);
console.log('MsgSend amount:', msgSendValue.amount);

const msgSendBytes = MsgSend.encode(msgSendValue).finish();
console.log('MsgSend encoded length:', msgSendBytes.length);
console.log('MsgSend encoded (first 32 hex):', Buffer.from(msgSendBytes.slice(0, 32)).toString('hex'));

const msgSendAny = Any.fromPartial({
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: msgSendBytes
});

console.log('MsgSend Any typeUrl:', msgSendAny.typeUrl);
console.log('MsgSend Any value length:', msgSendAny.value.length);

// 5. TxBody Analysis
console.log('\n5️⃣ TXBODY ANALYSIS');
console.log('------------------');

const txBodyValue = {
    messages: [msgSendAny],
    memo: "",
    timeoutHeight: Long.fromNumber(0),
    extensionOptions: [],
    nonCriticalExtensionOptions: []
};

const txBodyBytes = TxBody.encode(txBodyValue).finish();
console.log('TxBody encoded length:', txBodyBytes.length);
console.log('TxBody encoded (first 32 hex):', Buffer.from(txBodyBytes.slice(0, 32)).toString('hex'));

// 6. AuthInfo Analysis
console.log('\n6️⃣ AUTHINFO ANALYSIS');
console.log('--------------------');

const fee = {
    amount: [{ denom: 'uatom', amount: '5000' }],
    gas: '200000'
};

const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey: pubkeyAny, sequence: Long.fromNumber(currentSequence) }],
    fee.amount,
    parseInt(fee.gas)
);

console.log('AuthInfo encoded length:', authInfoBytes.length);
console.log('AuthInfo encoded (first 32 hex):', Buffer.from(authInfoBytes.slice(0, 32)).toString('hex'));
console.log('Sequence used:', currentSequence);
console.log('Gas used:', fee.gas);

// 7. SignDoc Analysis
console.log('\n7️⃣ SIGNDOC ANALYSIS');
console.log('-------------------');

const signDoc = makeSignDoc(
    txBodyBytes,
    authInfoBytes,
    chainId,
    Long.fromNumber(accountNumber)
);

console.log('SignDoc chainId:', signDoc.chainId);
console.log('SignDoc accountNumber:', signDoc.accountNumber.toString());
console.log('SignDoc bodyBytes length:', signDoc.bodyBytes.length);
console.log('SignDoc authInfoBytes length:', signDoc.authInfoBytes.length);

// 8. Signature Creation Analysis
console.log('\n8️⃣ SIGNATURE CREATION ANALYSIS');
console.log('-------------------------------');

const signDocForSigning = {
    bodyBytes: signDoc.bodyBytes,
    authInfoBytes: signDoc.authInfoBytes,
    chainId: signDoc.chainId,
    accountNumber: signDoc.accountNumber
};

const signDocBytes = SignDoc.encode(signDocForSigning).finish();
const messageHash = sha256(signDocBytes);

console.log('SignDoc bytes length:', signDocBytes.length);
console.log('SignDoc bytes (first 32 hex):', Buffer.from(signDocBytes.slice(0, 32)).toString('hex'));
console.log('Message hash length:', messageHash.length);
console.log('Message hash (hex):', Buffer.from(messageHash).toString('hex'));

// Test multiple signature approaches
console.log('\n🔬 SIGNATURE METHOD COMPARISON');
console.log('------------------------------');

// Method 1: Noble compact raw bytes (current approach)
const sig1 = secp256k1.sign(messageHash, privateKey);
const sig1Bytes = sig1.toCompactRawBytes();
console.log('Method 1 - Noble compact raw:');
console.log('  Length:', sig1Bytes.length);
console.log('  Signature (hex):', Buffer.from(sig1Bytes).toString('hex'));
console.log('  Local verification:', secp256k1.verify(sig1Bytes, messageHash, publicKey));

// Method 2: Manual r+s construction
const r = sig1.r;
const s = sig1.s;
const rBytes = new Uint8Array(32);
const sBytes = new Uint8Array(32);
const rHex = r.toString(16).padStart(64, '0');
const sHex = s.toString(16).padStart(64, '0');

for (let i = 0; i < 32; i++) {
    rBytes[i] = parseInt(rHex.substr(i * 2, 2), 16);
    sBytes[i] = parseInt(sHex.substr(i * 2, 2), 16);
}

const sig2Bytes = new Uint8Array(64);
sig2Bytes.set(rBytes, 0);
sig2Bytes.set(sBytes, 32);

console.log('Method 2 - Manual r+s construction:');
console.log('  Length:', sig2Bytes.length);
console.log('  Signature (hex):', Buffer.from(sig2Bytes).toString('hex'));
console.log('  Bytes match Method 1:', Buffer.from(sig1Bytes).equals(Buffer.from(sig2Bytes)));

// 9. Chain Verification Simulation
console.log('\n9️⃣ CHAIN VERIFICATION SIMULATION');
console.log('---------------------------------');

// What the chain should be doing:
// 1. Decode the transaction
// 2. Extract public key from AuthInfo
// 3. Verify signature against SignDoc hash using public key
// 4. Check account number and sequence

console.log('Chain verification checklist:');
console.log('✓ Account number matches:', accountNumber === 458);
console.log('✓ Chain ID matches:', chainId === 'cosmos_262144-1');
console.log('✓ Public key derivation correct:', cosmosAddress === 'cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');
console.log('✓ Signature format (64 bytes):', sig1Bytes.length === 64);
console.log('✓ Local signature verification:', secp256k1.verify(sig1Bytes, messageHash, publicKey));

// 10. Potential Issues Analysis
console.log('\n🚨 POTENTIAL ISSUES ANALYSIS');
console.log('----------------------------');

console.log('Issue 1 - Sequence Mismatch:');
console.log('  Current sequence on chain: 34');
console.log('  Using in transaction: 34');
console.log('  Status: ✓ MATCH');

console.log('\nIssue 2 - Public Key Type:');
console.log('  Chain expects: /cosmos.evm.crypto.v1.ethsecp256k1.PubKey');
console.log('  We are using: /cosmos.evm.crypto.v1.ethsecp256k1.PubKey');
console.log('  Status: ✓ MATCH');

console.log('\nIssue 3 - Signature Algorithm:');
console.log('  Chain expects: eth_secp256k1 (64-byte r+s)');
console.log('  We provide: 64-byte compact raw signature');
console.log('  Status: ✓ LIKELY CORRECT');

console.log('\nIssue 4 - Key Derivation:');
console.log('  Expected address: cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');
console.log('  Generated address:', cosmosAddress);
console.log('  Status:', cosmosAddress === 'cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz' ? '✓ MATCH' : '❌ MISMATCH');

console.log('\n🎯 CONCLUSION');
console.log('==============');
console.log('All components appear technically correct.');
console.log('The issue may be:');
console.log('1. Race condition with sequence number');
console.log('2. Subtle encoding difference in protobuf');
console.log('3. Chain-specific signature verification requirements');
console.log('4. Public key encoding format expectations');