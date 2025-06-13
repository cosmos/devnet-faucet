# Signing and Broadcasting Cosmos SDK Transactions on EVM Chains (TypeScript)

EVM-compatible Cosmos chains (like those built on Ethermint) use a different key type and address format than standard Cosmos SDK chains. Specifically, **Ethermint-based chains use the `eth_secp256k1` curve and Ethereum-style addresses**. This means the Cosmos bech32 address is derived from the **Keccak-256 hash of the public key (first 20 bytes)** instead of the Cosmos SDK's default SHA-256 + RIPEMD160 scheme. For example, Ethermint addresses have 20-byte account IDs and use prefixes like `evmos1...` or `eth1...`, derived via Ethereum's method.

To sign transactions on such chains in TypeScript, we need to account for the custom pubkey type and address derivation. Below is a generalized TypeScript module that demonstrates how to **build, sign (using SignMode.DIRECT), simulate, and broadcast** Cosmos SDK transactions on Ethermint-based chains with `eth_secp256k1` keys. It supports arbitrary message types (e.g. bank, staking, IBC messages), always uses the Ethermint key format, and allows customization of fees, gas, and memo.

## Implementation Overview

The implementation consists of several steps and helper functions:

1. **Key and Address Handling** – Generate or use an existing `eth_secp256k1` keypair, and derive the Cosmos address by Bech32-encoding the Ethereum-style address (Keccak-256 of the pubkey) with the chain’s prefix.
2. **Message Construction** – Create Cosmos SDK message objects (e.g. `MsgSend`, `MsgDelegate`) which can be encoded for the transaction.
3. **Transaction Building** – Construct the `TxBody` (with messages and memo) and `AuthInfo` (with fees, gas limit, and signer info) using Cosmos’s proto utilities. The public key is wrapped in a protobuf `Any` with type URL `/ethermint.crypto.v1.ethsecp256k1.PubKey` for Ethermint chains.
4. **Account Info Retrieval** – Query the chain’s REST API for the account’s current sequence and account number (required for signing). Ethermint chains often return an `EthAccount` type which contains a `base_account` with these values.
5. **Gas Simulation** – (Optional) Simulate the transaction by sending a `cosmos/tx/v1beta1/simulate` request with the built Tx (signature empty) to get an estimated gas usage. This can be used to adjust the fee or gas limit automatically.
6. **Signing** – Use an offline signer (from Keplr, CosmJS wallet, or direct private key) to sign the `SignDoc` (which includes chain-id, account number, sequence, and the Tx bytes) in DIRECT mode. CosmJS’s `OfflineDirectSigner.signDirect` will produce a signature over the SignDoc bytes using `eth_secp256k1`. We ensure the signer uses the Ethermint pubkey format when signing by providing the correct `Any` wrapped pubkey in AuthInfo.
7. **Broadcasting** – Assemble the signed transaction (TxRaw) with the signature, then broadcast it via the Tendermint RPC or LCD. Here we use CosmJS’s `SigningStargateClient.broadcastTx` for convenience, which sends the TxRaw bytes to the network.

Let's walk through the code with these steps in mind.

## 1. Key Generation and Address Derivation (eth\_secp256k1)

```ts
import { DirectSecp256k1Wallet, DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { keccak256 } from "@ethersproject/keccak256";  // or another keccak256 util
import { toBech32 } from "@cosmjs/encoding";

/**
 * Generates an Ethermint-compatible wallet from a given private key or mnemonic.
 * For Ethermint chains, we use the Ethereum HD path (m/44'/60'/0'/0/0 by default).
 * Returns the wallet and its Bech32 address (derived via keccak(pubkey)[0:20]).
 */
async function getEthSecp256k1Wallet(privateKey: Uint8Array | null, mnemonic: string | null, prefix: string) {
  let wallet;
  if (mnemonic) {
    // Use Ethereum's coin type 60 for Ethermint (HD path m/44'/60'/...)
    wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: prefix, coinType: 60 });
  } else if (privateKey) {
    wallet = await DirectSecp256k1Wallet.fromKey(privateKey, prefix);
  } else {
    throw new Error("Must provide either mnemonic or private key");
  }
  const [account] = await wallet.getAccounts();
  // CosmJS DirectSecp256k1Wallet by default derives the Cosmos address using cosmos hashing.
  // For Ethermint, we override address derivation: compute 20-byte eth address from pubkey and bech32-encode it.
  const pubkeyBytes = account.pubkey;
  const ethAddressBytes = keccak256(pubkeyBytes).slice(0, 40);  // keccak256 returns hex string; take first 20 bytes (40 hex chars)
  const ethAddress = "0x" + ethAddressBytes;  // Ethereum hex address (optional)
  const bech32Address = toBech32(prefix, Buffer.from(ethAddressBytes, "hex"));
  return { wallet, address: bech32Address, pubkey: pubkeyBytes };
}
```

**Explanation:** We create a wallet using CosmJS. If using an HD wallet, we set `coinType: 60` (Ethereum’s coin type) so that the mnemonic-derived key is the same as an Ethereum wallet (Ethermint uses path `m/44'/60'/...`). CosmJS’s `DirectSecp256k1HdWallet` will still return a Cosmos-style address by default, so we manually derive the Ethermint Bech32 address:

* Compute the Keccak-256 hash of the 33-byte compressed pubkey, take the first 20 bytes (40 hex chars).
* Encode this 20-byte value in Bech32 with the chain’s prefix (e.g. `"evmos"`, `"eth"`, `"cosmos"` depending on the chain). This yields the account’s address on the Ethermint chain, matching the format used by the chain’s auth module.

## 2. Constructing Cosmos Messages (Example: MsgSend)

We can construct any Cosmos SDK message using either the protobuf classes or CosmJS’s registry. Here’s an example for a simple **token transfer (MsgSend)**. We will also show how to accept an *array of arbitrary messages* for signing.

```ts
import { EncodeObject } from "@cosmjs/proto-signing";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";  // Proto definition for MsgSend

/**
 * Creates a MsgSend EncodeObject for a token transfer.
 */
function createMsgSend(fromAddress: string, toAddress: string, amount: string, denom: string): EncodeObject {
  // Use the protobuf MsgSend type from cosmos-sdk
  const msg: MsgSend = MsgSend.fromPartial({
    fromAddress,
    toAddress,
    amount: [{ denom, amount }],
  });
  return {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: msg,
  };
}
```

For other message types (e.g. `MsgDelegate`, `MsgVote`, `MsgTransfer` for IBC, etc.), you would similarly construct the protobuf message and wrap it in an `EncodeObject` with the appropriate `typeUrl`. These messages can then be included in an array to form a multi-message transaction. For example:

```ts
// Example: constructing multiple messages
const sendMsg = createMsgSend(myAddress, recipientAddress, "1000000", "aphoton");
const delegateMsg: EncodeObject = {
  typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
  value: {
    delegatorAddress: myAddress,
    validatorAddress: validatorAddr,
    amount: { denom: "aphoton", amount: "500000" },
  },
};
const messages: EncodeObject[] = [sendMsg, delegateMsg];
```

Here, we directly use a JavaScript object for `MsgDelegate` for brevity. In practice, you may import the `MsgDelegate` proto class from `cosmjs-types/cosmos/staking/v1beta1/tx` and construct it similarly to `MsgSend`. The **CosmJS registry** can encode these messages when preparing the transaction.

## 3. Preparing the Transaction (TxBody, AuthInfo, SignDoc)

With the messages ready, we build the transaction body and signing info. We use CosmJS utilities `makeAuthInfoBytes` and `makeSignDoc` to create the necessary protobuf bytes:

```ts
import { Registry, makeAuthInfoBytes, makeSignDoc, GasPrice, calculateFee } from "@cosmjs/proto-signing";
import { TxBodyEncodeObject } from "@cosmjs/stargate";
import { Any } from "cosmjs-types/google/protobuf/any";
import { PubKey as EthPubKey } from "cosmjs-types/cosmos/crypto/secp256k1/keys";  // cosmos Crypto secp256k1 (structure identical for Ethermint keys)

/**
 * Prepares the TxBody bytes and AuthInfo bytes for signing.
 * - `messages` is an array of EncodeObjects for the transaction.
 * - `memo` is an optional memo.
 * - `pubkeyBytes` is the 33-byte compressed public key of the signer (eth_secp256k1).
 * - `sequence` and `accountNumber` are from chain's account info.
 * - `gasLimit` and `feeAmount` define the transaction fee (can be estimated via simulation).
 */
function buildTx(messages: EncodeObject[], memo: string, pubkeyBytes: Uint8Array, sequence: number, accountNumber: number, gasLimit: number, feeAmount: string, feeDenom: string) {
  // 3a. Construct TxBody
  const txBody: TxBodyEncodeObject = {
    typeUrl: "/cosmos.tx.v1beta1.TxBody",
    value: { messages: messages, memo: memo || "" },
  };
  const registry = new Registry();  // use default registry or one pre-populated with cosmos types
  // (If using SigningStargateClient, you can use client.registry instead)
  // Note: If messages include custom types not in default registry, you need to register them.

  const txBodyBytes = registry.encode(txBody);

  // 3b. Prepare the signer public key in protobuf Any format with Ethermint type URL
  const pubKeyAny = Any.fromPartial({
    typeUrl: "/ethermint.crypto.v1.ethsecp256k1.PubKey",
    value: EthPubKey.encode({ key: pubkeyBytes }).finish(),  // assuming same structure: single 'key' field
  });

  // 3c. Build AuthInfo (signer info with pubkey, sequence, and fee)
  // feeAmount is a string (e.g. "20000000000000000") and feeDenom e.g. "aphoton"
  const fee = [{ amount: feeAmount, denom: feeDenom }];
  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey: pubKeyAny, sequence: sequence }],  // one signer info
    fee,             // fee amount as Coin[]
    gasLimit,        // gas limit as number
    undefined,       // optional feeGranter
    undefined        // optional feePayer
  );

  // 3d. Make SignDoc
  const signDoc = makeSignDoc(txBodyBytes, authInfoBytes, chainId, accountNumber);
  return { txBodyBytes, authInfoBytes, signDoc };
}
```

**Key points:**

* We create a `TxBody` with our messages and memo. The `Registry.encode` method serializes the messages properly into bytes. (If using `SigningStargateClient`, you could call `client.registry.encode(txBody)` similarly.)
* **Custom PubKey Any:** We wrap the  `pubkeyBytes` in an `Any` with type URL `"/ethermint.crypto.v1.ethsecp256k1.PubKey"`. Ethermint’s pubkey proto has the same structure as Cosmos’s secp256k1 (a single `bytes key` field), so we reuse `cosmos.crypto.secp256k1.PubKey` to encode the bytes, but we label it with Ethermint’s type URL. This ensures that when the transaction is broadcast, the chain recognizes the pubkey as eth\_secp256k1. Without this, the chain might expect a different pubkey type and reject the signature.
* **AuthInfo:** Contains the signer’s info (pubkey and sequence) and the fee. We use `makeAuthInfoBytes` to create it. The gas limit and fee must be decided here. We provide the `fee` as an array of coins and the `gasLimit` as a number.
* **SignDoc:** Finally, `makeSignDoc` assembles the canonical SignDoc bytes from `txBodyBytes`, `authInfoBytes`, the chain ID, and account number. This SignDoc is what will be signed by the signer’s private key.

## 4. Fetching Account Number and Sequence

Before signing, we need the account’s current sequence and account number from the chain. We can use the chain’s REST API (`/cosmos/auth/v1beta1/accounts/{address}`) to get this. Ethermint chains often return an `EthAccount` type, where the relevant data is nested under `base_account`. The code below fetches the account info and handles both BaseAccount and EthAccount responses:

```ts
import fetch from "cross-fetch";  // or global fetch in browser

interface BaseAccountResponse {
  account: {
    "@type": string,
    address: string,
    pub_key?: { "@type": string, key: string },
    account_number: string,
    sequence: string
  }
}
interface EthAccountResponse {
  account: {
    "@type": string,  // e.g. "/ethermint.types.v1.EthAccount"
    base_account: {
      address: string,
      pub_key?: { "@type": string, key: string },
      account_number: string,
      sequence: string
    },
    code_hash?: string
  }
}

/**
 * Queries the chain's REST API for account number and sequence.
 */
async function fetchAccountInfo(lcdEndpoint: string, address: string): Promise<{ accountNumber: number, sequence: number }> {
  const url = `${lcdEndpoint}/cosmos/auth/v1beta1/accounts/${address}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch account info: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as BaseAccountResponse | EthAccountResponse;
  let accountNumber: number, sequence: number;
  if ("base_account" in data.account) {
    // Ethermint EthAccount
    accountNumber = Number(data.account.base_account.account_number);
    sequence = Number(data.account.base_account.sequence);
  } else {
    // BaseAccount (non-eth chain or already using BaseAccount in Ethermint if no EthAccount yet)
    accountNumber = Number(data.account.account_number);
    sequence = Number(data.account.sequence);
  }
  return { accountNumber, sequence };
}
```

This function will return the account’s `accountNumber` and `sequence` which we need for signing. We also get the public key (`pub_key`) in the response if needed, but since we usually have the pubkey from our wallet, we don’t explicitly use it here. (If the account has not done any transactions yet, the chain may not have a pubkey on file; in that case, we definitely need to provide it in the transaction as we do.)

## 5. Gas Simulation (Estimating Gas and Fee)

It’s good practice to simulate the transaction to estimate the gas before signing, especially if we want to use `auto` gas or to ensure we don’t underpay fees. We can use the `/cosmos/tx/v1beta1/simulate` REST endpoint to get a gas estimate. Simulation requires us to build a transaction with the correct messages and an **unsigned signature**. We can reuse our earlier transaction-building and simply put a dummy signature for simulation:

```ts
import { TxRaw, Tx } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";

/**
 * Simulates the transaction to get estimated gas usage.
 * Uses the built TxBody and AuthInfo, but inserts an empty signature.
 */
async function simulateTx(lcdEndpoint: string, txBodyBytes: Uint8Array, authInfoBytes: Uint8Array): Promise<number> {
  // Build a TxRaw with empty signature for simulation
  const txRaw: TxRaw = TxRaw.fromPartial({
    bodyBytes: txBodyBytes,
    authInfoBytes: authInfoBytes,
    signatures: [new Uint8Array()]  // empty signature
  });
  // Alternatively, construct Tx and then encode:
  // const tx: Tx = Tx.fromPartial({
  //   body: TxBody.decode(txBodyBytes),
  //   authInfo: AuthInfo.decode(authInfoBytes),
  //   signatures: [new Uint8Array()],
  // });
  // const txBytes = Tx.encode(tx).finish();

  const txBytesBase64 = Buffer.from(TxRaw.encode(txRaw).finish()).toString("base64");
  const res = await fetch(`${lcdEndpoint}/cosmos/tx/v1beta1/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx_bytes: txBytesBase64 })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Simulation failed: ${res.status} ${res.statusText} - ${err}`);
  }
  const simResult = await res.json();
  const gasUsed = Number(simResult.gas_info?.gas_used || 0);
  return gasUsed;
}
```

We serialize the unsigned TxRaw to base64 and call the simulate endpoint. The response includes `gas_used` (and `gas_wanted`). We return `gasUsed` as a number. With this, we can decide a fee:

For example, we might multiply the used gas by a safety factor (e.g. 1.2) and then multiply by a gas price to get the fee amount. CosmJS provides `GasPrice` and `calculateFee` helpers to compute the fee. For instance:

```ts
// After getting gasUsed from simulateTx:
const gasLimit = Math.ceil(gasUsed * 1.2);
const gasPrice = GasPrice.fromString("20000000000aphoton");  // 20 gwei in aphoton, for example
const fee = calculateFee(gasLimit, gasPrice);
```

`fee.amount` will be an array of coins (e.g. `[{ denom: "aphoton", amount: "<calculated_amount>" }]`) and `fee.gas` is the gas limit as string. You can then pass `fee.amount` and `fee.gas` into `makeAuthInfoBytes` instead of manually setting as we did earlier, if you prefer.

The implementation allows **manual override** of fees as well. If the caller provides a custom fee, you can skip simulation or override the `gasLimit`/`feeAmount` accordingly. In summary, simulation is optional but recommended to get accurate gas estimates.

## 6. Signing the Transaction (SignMode.DIRECT with eth\_secp256k1)

Now we have all pieces to sign the transaction. We’ll use an **offline direct signer** (which could be from Keplr or a CosmJS wallet) to sign the SignDoc we created. The signer must ultimately use the `eth_secp256k1` private key. Keplr, for example, can provide an `OfflineDirectSigner` for Ethermint chains (it will supply the correct pubkey in `signer.getAccounts()`). If using a raw private key, CosmJS’s `DirectSecp256k1Wallet` can sign, but we must ensure we gave it the Ethermint address (which we did via prefix) and we supply the custom pubkey Any in AuthInfo.

```ts
import { OfflineDirectSigner, DirectSignResponse } from "@cosmjs/proto-signing";

/**
 * Signs the given SignDoc using the provided OfflineDirectSigner (eth_secp256k1).
 * Returns the signed transaction bytes (TxRaw).
 */
async function signTransaction(signer: OfflineDirectSigner, signerAddress: string, signDoc: any): Promise<Uint8Array> {
  // The OfflineDirectSigner interface (from CosmJS) has signDirect method for direct mode
  const directSignResponse: DirectSignResponse = await signer.signDirect(signerAddress, signDoc);
  const { signed, signature } = directSignResponse;
  // Assemble the TxRaw with the signed body, signed authInfo, and signature
  const txRaw = TxRaw.fromPartial({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: [ signature.signature ]  // signature.signature is a Uint8Array (in DirectSignResponse it's Base64 string in some versions, but CosmJS ensures Uint8Array here)
  });
  const txBytes = TxRaw.encode(txRaw).finish();
  return txBytes;
}
```

A few notes on signing:

* We call `signer.signDirect(address, signDoc)`, which returns a `DirectSignResponse` containing the signed body and authInfo bytes, as well as the signature itself. The signer takes care of hashing the SignDoc and using the private key to produce a signature (with `eth_secp256k1`, this is an ECDSA secp256k1 signature over the sign bytes – since Ethermint uses the same curve as Cosmos, the signature format is the same, but the signing algorithm internally might use keccak for the sign bytes hash. CosmJS will handle this).
* We then construct a `TxRaw` protobuf. It includes the `signed.bodyBytes`, `signed.authInfoBytes` (which now contain the signer's pubkey and the specified fee/gas), and the signature bytes. We encode this to get the final `txBytes` ready for broadcast.
* Note: If `signature.signature` is base64 (depending on CosmJS version, `signature` might be an `StdSignature` or similar), convert it to Uint8Array (e.g. `fromBase64(signature.signature)`). In our code above, we assume it's already Uint8Array.

## 7. Broadcasting the Transaction

Finally, we send the signed transaction to the blockchain. We can either use the chain’s RPC endpoint or the LCD. A convenient method is to use CosmJS’s `SigningStargateClient`, which has a `broadcastTx` method. If we already have a `SigningStargateClient` instance (perhaps from earlier if we used it for other operations), we can use it. Otherwise, we can do a direct HTTP POST to `/cosmos/tx/v1beta1/broadcast` or use Tendermint RPC. Here’s how to do it with a client:

```ts
import { SigningStargateClient } from "@cosmjs/stargate";

/**
 * Broadcasts the signed transaction bytes to the network and returns the result.
 */
async function broadcastTransaction(rpcEndpoint: string, txBytes: Uint8Array): Promise<void> {
  // You could also pass an existing signer and use connectWithSigner if you have one
  const client = await SigningStargateClient.connect(rpcEndpoint);
  const result = await client.broadcastTx(txBytes);
  if (result.code !== 0) {
    throw new Error(`Tx failed with code ${result.code}: ${result.rawLog}`);
  }
  console.log(`Transaction successful: ${result.transactionHash}`);
}
```

Alternatively, you can do:

```ts
// Broadcast via REST (async mode)
await fetch(`${lcdEndpoint}/cosmos/tx/v1beta1/txs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tx_bytes: Buffer.from(txBytes).toString("base64"), mode: "BROADCAST_MODE_SYNC" })
});
```

The above would POST the tx to the LCD. But using the `SigningStargateClient.broadcastTx` (which uses RPC) is typically more straightforward in a Node.js or browser environment.

## Putting It All Together (Example Usage)

Finally, here is an example of using the above functions to send a transaction:

```ts
const chainId = "evmos_9001-2";                     // chain ID of the network
const lcd = "https://rest.evmos.org:1317";          // example LCD endpoint
const rpc = "https://rpc.evmos.org:26657";          // example RPC endpoint
const prefix = "evmos";                             // bech32 address prefix for the chain
const mnemonic = "<YOUR 24-WORD MNEMONIC>";
// 1. Get wallet and Ethermint address
const { wallet, address, pubkey } = await getEthSecp256k1Wallet(null, mnemonic, prefix);
console.log("Sender address:", address);
// 2. Prepare a message (e.g., send tokens)
const msgSend = createMsgSend(address, "evmos1xyz...recipient", "1000000000000000000", "aevmos");  // 1 EVMOS in wei (18 decimals) if aevmos has 18 decimals
const messages = [ msgSend ];
// 3. Query account info for accountNumber & sequence
const { accountNumber, sequence } = await fetchAccountInfo(lcd, address);
// 4. (Optional) Simulate to get gas estimate
const tempGasLimit = 200000;  // initial guess
const { txBodyBytes, authInfoBytes, signDoc } = buildTx(messages, "My memo or note", pubkey, sequence, accountNumber, tempGasLimit, "0", "aevmos");
let gasUsed = 0;
try {
  gasUsed = await simulateTx(lcd, txBodyBytes, authInfoBytes);
  console.log(`Simulated gas used: ${gasUsed}`);
} catch (e) {
  console.warn("Simulation failed, proceeding with default gas");
}
const gasLimit = gasUsed > 0 ? Math.ceil(gasUsed * 1.2) : tempGasLimit;
const gasPrice = GasPrice.fromString("20000000000aevmos");  // 20 Gwei as 20,000,000,000 aevmos
const feeObj = calculateFee(gasLimit, gasPrice);
// 5. Rebuild Tx with adjusted gas & fee
const { signDoc: signDocFinal } = buildTx(messages, "My memo or note", pubkey, sequence, accountNumber, gasLimit, feeObj.amount[0].amount, feeObj.amount[0].denom);
// 6. Sign the transaction
const signer = wallet;  // DirectSecp256k1HdWallet is an OfflineDirectSigner
const txBytes = await signTransaction(signer, address, signDocFinal);
// 7. Broadcast the transaction
const client = await SigningStargateClient.connect(rpc);
const result = await client.broadcastTx(txBytes);
console.log(`Broadcast result: ${result.rawLog}`);
```

This example shows the end-to-end flow:

* We obtained a signing wallet and the correct address.
* Constructed a `MsgSend` message.
* Fetched account details from the REST API.
* Simulated the transaction to estimate gas.
* Calculated an appropriate fee using a gas price and rebuilt the transaction with that fee.
* Used the wallet (which implements `OfflineDirectSigner`) to sign the transaction. The signDoc included our Ethermint pubkey in an `Any`, ensuring the signature is valid for the chain.
* Finally, we broadcast the signed transaction and handled the result.

## References

* CosmJS documentation and sources for transaction signing (AuthInfo, SignDoc).
* Ethermint (Evmos) key and address format documentation.
* Hermes IBC Relayer config, demonstrating Ethermint address and pubkey types.
* Example code for signing Ethermint transactions (Keplr integration).
