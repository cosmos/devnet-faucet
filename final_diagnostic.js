// Final diagnostic - create a working CosmJS transaction for comparison
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { SigningStargateClient } from "@cosmjs/stargate";
import { pathToString } from '@cosmjs/crypto';
import { fromHex, toBase64 } from '@cosmjs/encoding';
import { secp256k1 } from '@noble/curves/secp256k1';
import { mnemonicToSeedSync } from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

const bip32 = BIP32Factory(ecc);

// Same configuration as our faucet
const mnemonic = 'mosquito peanut thought width car cushion salt matter trouble census win tribe leisure truth install basic april direct indicate eyebrow liar afraid street trip';
const chainId = 'cosmos_262144-1';
const endpoint = 'https://cevm-01-lcd.dev.skip.build';

console.log('🔬 FINAL DIAGNOSTIC: CosmJS vs Manual Implementation');
console.log('=================================================\n');

async function testCosmJSTransaction() {
  try {
    console.log('1️⃣ Testing CosmJS DirectSecp256k1Wallet...');
    
    // Create CosmJS wallet exactly like our manual derivation
    const derivationPath = "m/44'/60'/0'/0/0";
    const seed = mnemonicToSeedSync(mnemonic);
    const hdwallet = bip32.fromSeed(seed);
    const derivedNode = hdwallet.derivePath(derivationPath);
    const privateKey = derivedNode.privateKey;
    
    console.log('Private key length:', privateKey.length);
    console.log('Private key (first 8 hex):', Buffer.from(privateKey.slice(0, 4)).toString('hex') + '...');
    
    // Create DirectSecp256k1Wallet
    const wallet = await DirectSecp256k1Wallet.fromKey(privateKey, "cosmos");
    const [account] = await wallet.getAccounts();
    
    console.log('CosmJS generated address:', account.address);
    console.log('CosmJS pubkey algo:', account.algo);
    console.log('CosmJS pubkey length:', account.pubkey.length);
    console.log('CosmJS pubkey (hex):', Buffer.from(account.pubkey).toString('hex'));
    
    console.log('Expected address: cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');
    console.log('Addresses match:', account.address === 'cosmos1gtnqglzhszcs8efzvhmys0pdqyf656u8wmfcuz');
    
    // Try to create a signing client
    console.log('\n2️⃣ Testing SigningStargateClient...');
    
    const client = await SigningStargateClient.connectWithSigner(
      'https://cevm-01-rpc.dev.skip.build',
      wallet
    );
    
    console.log('Client connected successfully');
    
    // Get account info
    const accountInfo = await client.getAccount(account.address);
    console.log('Account info from client:', {
      accountNumber: accountInfo?.accountNumber,
      sequence: accountInfo?.sequence
    });
    
    // Try to simulate a transaction
    console.log('\n3️⃣ Testing transaction simulation...');
    
    const testMsg = {
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: {
        fromAddress: account.address,
        toAddress: "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
        amount: [{ denom: "uatom", amount: "1000000" }]
      }
    };
    
    const fee = {
      amount: [{ denom: "uatom", amount: "5000" }],
      gas: "200000"
    };
    
    // Simulate the transaction
    const simResult = await client.simulate(account.address, [testMsg], "");
    console.log('Simulation successful. Gas estimate:', simResult);
    
    // Sign and broadcast
    console.log('\n4️⃣ Attempting to sign and broadcast...');
    const result = await client.signAndBroadcast(account.address, [testMsg], fee, "");
    console.log('Transaction successful!', result);
    
    return result;
    
  } catch (error) {
    console.error('CosmJS test failed:', error.message);
    
    // Let's try manual signing with CosmJS
    console.log('\n5️⃣ Testing manual signing with CosmJS...');
    
    try {
      const wallet = await DirectSecp256k1Wallet.fromKey(privateKey, "cosmos");
      const [account] = await wallet.getAccounts();
      
      // Manually create SignDoc like our implementation
      const { makeSignDoc, makeAuthInfoBytes } = await import("@cosmjs/proto-signing");
      const { TxBody, SignDoc } = await import("cosmjs-types/cosmos/tx/v1beta1/tx.js");
      const { Any } = await import("cosmjs-types/google/protobuf/any.js");
      const { MsgSend } = await import("cosmjs-types/cosmos/bank/v1beta1/tx.js");
      
      // Create message
      const msgSendValue = MsgSend.fromPartial({
        fromAddress: account.address,
        toAddress: "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
        amount: [{ denom: "uatom", amount: "1000000" }]
      });
      
      const msgSendAny = Any.fromPartial({
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: MsgSend.encode(msgSendValue).finish()
      });
      
      const txBodyValue = {
        messages: [msgSendAny],
        memo: "",
        timeoutHeight: 0,
        extensionOptions: [],
        nonCriticalExtensionOptions: []
      };
      
      const txBodyBytes = TxBody.encode(txBodyValue).finish();
      
      // Get fresh account info
      const response = await fetch(`${endpoint}/cosmos/auth/v1beta1/accounts/${account.address}`);
      const data = await response.json();
      const accountNumber = parseInt(data.account.account_number);
      const sequence = parseInt(data.account.sequence);
      
      console.log('Using account number:', accountNumber, 'sequence:', sequence);
      
      // Create AuthInfo - this is where the difference might be
      const fee = {
        amount: [{ denom: "uatom", amount: "5000" }],
        gas: "200000"
      };
      
      const authInfoBytes = makeAuthInfoBytes(
        [{ pubkey: account.pubkey, sequence: sequence }], // CosmJS handles pubkey encoding
        fee.amount,
        parseInt(fee.gas)
      );
      
      // Create SignDoc
      const signDoc = makeSignDoc(
        txBodyBytes,
        authInfoBytes,
        chainId,
        accountNumber
      );
      
      // Sign with CosmJS
      const signResult = await wallet.signDirect(account.address, signDoc);
      
      console.log('CosmJS manual signing successful!');
      console.log('Signature length:', signResult.signature.signature.length);
      console.log('PubKey type in signature:', signResult.signature.pub_key?.type);
      
      // Compare with our implementation
      console.log('\n6️⃣ Comparing with our implementation...');
      
      // Our public key derivation
      const ourPubkey = secp256k1.getPublicKey(privateKey, true);
      console.log('Our pubkey matches CosmJS:', Buffer.from(ourPubkey).equals(Buffer.from(account.pubkey)));
      
    } catch (manualError) {
      console.error('Manual CosmJS signing also failed:', manualError.message);
    }
  }
}

// Run the test
testCosmJSTransaction().then(() => {
  console.log('\n✅ Diagnostic complete');
}).catch(error => {
  console.error('\n❌ Diagnostic failed:', error.message);
});