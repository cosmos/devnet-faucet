import { ethers } from 'ethers';
import conf from './config.js';
import fetch from 'node-fetch';
import { bech32 } from 'bech32';

async function bootstrapCosmosAccount() {
    console.log('🚀 Bootstrapping Cosmos Account via WERC20...');
    
    try {
        // Initialize EVM provider and wallet
        const evmProvider = new ethers.JsonRpcProvider(conf.blockchain.endpoints.evm_endpoint);
        const evmWallet = ethers.Wallet.fromPhrase(conf.blockchain.sender.mnemonic, evmProvider);
        
        console.log('Faucet EVM address:', evmWallet.address);
        
        // Check current EVM balance
        const evmBalance = await evmProvider.getBalance(evmWallet.address);
        console.log('Current EVM balance:', ethers.formatEther(evmBalance), 'ETH');
        
        // WERC20 precompile address (you'll need to find the correct address)
        // This is a placeholder - you'll need to get the actual WERC20 precompile address
        const werc20Address = '0x0000000000000000000000000000000000000801'; // Common precompile address pattern
        
        // WERC20 ABI based on the documentation
        const werc20ABI = [
            'function deposit() payable',
            'function withdraw(uint256 wad)',
            'event Deposit(address indexed dst, uint256 wad)',
            'event Withdrawal(address indexed src, uint256 wad)'
        ];
        
        console.log('\\n🔧 Step 1: Attempting to use WERC20 precompile...');
        console.log('WERC20 address:', werc20Address);
        
        try {
            const werc20Contract = new ethers.Contract(werc20Address, werc20ABI, evmWallet);
            
            // Try to deposit some native tokens to create cosmos-side balance
            const depositAmount = ethers.parseEther('1.0'); // 1 token
            console.log('Attempting to deposit:', ethers.formatEther(depositAmount), 'tokens');
            
            const tx = await werc20Contract.deposit({ value: depositAmount, gasLimit: 100000 });
            console.log('Deposit transaction sent:', tx.hash);
            
            const receipt = await tx.wait();
            console.log('✅ Deposit transaction confirmed in block:', receipt.blockNumber);
            
            // Wait a moment for state sync
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if cosmos account now exists
            const cosmosAddress = convertEvmToCosmos(evmWallet.address);
            console.log('\\n🔍 Step 2: Checking if cosmos account was created...');
            console.log('Cosmos address:', cosmosAddress);
            
            const accountUrl = `${conf.blockchain.endpoints.rest_endpoint}/cosmos/auth/v1beta1/accounts/${cosmosAddress}`;
            const accountResponse = await fetch(accountUrl);
            
            if (accountResponse.ok) {
                const accountData = await accountResponse.json();
                console.log('✅ Cosmos account exists!', accountData.account);
                
                // Check balances
                const balanceUrl = `${conf.blockchain.endpoints.rest_endpoint}/cosmos/bank/v1beta1/balances/${cosmosAddress}`;
                const balanceResponse = await fetch(balanceUrl);
                if (balanceResponse.ok) {
                    const balanceData = await balanceResponse.json();
                    console.log('✅ Cosmos balances:', balanceData.balances);
                } else {
                    console.log('⚠️  Could not fetch balances');
                }
            } else {
                console.log('⚠️  Cosmos account still does not exist');
            }
            
        } catch (error) {
            console.log('❌ WERC20 precompile interaction failed:', error.message);
            
            // Alternative approach: Try to find the correct WERC20 address
            console.log('\\n🔍 Alternative: Trying to find WERC20 precompile...');
            
            // Common precompile address ranges
            const possibleAddresses = [
                '0x0000000000000000000000000000000000000800',
                '0x0000000000000000000000000000000000000801',
                '0x0000000000000000000000000000000000000802',
                '0x0000000000000000000000000000000000000803',
                '0x0000000000000000000000000000000000000808',
                '0x0000000000000000000000000000000000000809'
            ];
            
            for (const addr of possibleAddresses) {
                try {
                    console.log(`Trying precompile at ${addr}...`);
                    const contract = new ethers.Contract(addr, werc20ABI, evmWallet);
                    
                    // Try a very small deposit to test
                    const testTx = await contract.deposit({ 
                        value: ethers.parseEther('0.001'), 
                        gasLimit: 100000 
                    });
                    console.log(`✅ Found working WERC20 at ${addr}! Transaction:`, testTx.hash);
                    await testTx.wait();
                    break;
                } catch (err) {
                    console.log(`❌ ${addr} failed:`, err.message.substring(0, 100));
                }
            }
        }
        
        console.log('\\n🎉 Bootstrap process completed!');
        
    } catch (error) {
        console.error('❌ Bootstrap failed:', error.message);
        console.error(error.stack);
    }
}

// Helper function to convert EVM address to cosmos address
function convertEvmToCosmos(evmAddress) {
    const hexBytes = evmAddress.slice(2); // Remove 0x prefix
    const addressBytes = Buffer.from(hexBytes, 'hex');
    return bech32.encode(conf.blockchain.sender.option.prefix, bech32.toWords(addressBytes));
}

bootstrapCosmosAccount();