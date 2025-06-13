import { ethers } from 'ethers';
import config from '../config.js';

/**
 * Fund Faucet Wallet Script
 * Transfer tokens from deployer to faucet wallet
 */

async function fundWithERC20(provider, deployerWallet, tokenConfig, faucetAddress) {
    console.log(`\n💰 Funding faucet with ${tokenConfig.denom.toUpperCase()}...`);

    try {
        // Skip native token
        if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
            console.log(`  ⏭️ Skipping native token`);
            return { success: true, skipped: true };
        }

        // Create contract instance
        const tokenContract = new ethers.Contract(
            tokenConfig.erc20_contract,
            [
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function decimals() view returns (uint8)",
                "function totalSupply() view returns (uint256)",
                "function balanceOf(address) view returns (uint256)",
                "function transfer(address to, uint256 amount) returns (bool)",
                "function allowance(address owner, address spender) view returns (uint256)",
                "function approve(address spender, uint256 amount) returns (bool)"
            ],
            deployerWallet
        );

        console.log(`  📋 Contract: ${tokenConfig.erc20_contract}`);

        // Check deployer balance
        const deployerBalance = await tokenContract.balanceOf(deployerWallet.address);
        console.log(`  💼 Deployer balance: ${ethers.formatUnits(deployerBalance, tokenConfig.decimals)}`);

        if (deployerBalance === 0n) {
            console.log(`  ❌ Deployer has no ${tokenConfig.denom} tokens`);
            return { success: false, error: 'No tokens to transfer' };
        }

        // Check current faucet balance
        const currentBalance = await tokenContract.balanceOf(faucetAddress);
        console.log(`  🚰 Current faucet balance: ${ethers.formatUnits(currentBalance, tokenConfig.decimals)}`);

        // Calculate how much to send (keep faucet at 10x target balance for operations)
        const targetBalance = BigInt(tokenConfig.target_balance) * 10n; // 10x target for operations
        const neededAmount = targetBalance - currentBalance;

        if (neededAmount <= 0n) {
            console.log(`  ✅ Faucet already has sufficient balance`);
            return { success: true, sufficient: true };
        }

        if (deployerBalance < neededAmount) {
            console.log(`  ⚠️ Deployer doesn't have enough tokens, sending available amount`);
            const sendAmount = deployerBalance;

            console.log(`  📤 Transferring ${ethers.formatUnits(sendAmount, tokenConfig.decimals)} ${tokenConfig.denom}...`);
            const tx = await tokenContract.transfer(faucetAddress, sendAmount);
            console.log(`  ⏳ Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`  ✅ Transfer completed! Gas used: ${receipt.gasUsed}`);

            return {
                success: true,
                amount: sendAmount.toString(),
                formatted: ethers.formatUnits(sendAmount, tokenConfig.decimals),
                tx_hash: tx.hash,
                gas_used: receipt.gasUsed.toString()
            };
        } else {
            console.log(`  📤 Transferring ${ethers.formatUnits(neededAmount, tokenConfig.decimals)} ${tokenConfig.denom}...`);
            const tx = await tokenContract.transfer(faucetAddress, neededAmount);
            console.log(`  ⏳ Transaction hash: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`  ✅ Transfer completed! Gas used: ${receipt.gasUsed}`);

            return {
                success: true,
                amount: neededAmount.toString(),
                formatted: ethers.formatUnits(neededAmount, tokenConfig.decimals),
                tx_hash: tx.hash,
                gas_used: receipt.gasUsed.toString()
            };
        }

    } catch (error) {
        console.log(`  ❌ Failed to fund with ${tokenConfig.denom}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function fundWithNative(provider, deployerWallet, faucetAddress) {
    console.log(`\n💰 Funding faucet with native tokens...`);

    try {
        // Check deployer balance
        const deployerBalance = await provider.getBalance(deployerWallet.address);
        console.log(`  💼 Deployer balance: ${ethers.formatEther(deployerBalance)} ETH`);

        if (deployerBalance === 0n) {
            console.log(`  ❌ Deployer has no native tokens`);
            return { success: false, error: 'No native tokens to transfer' };
        }

        // Check current faucet balance
        const currentBalance = await provider.getBalance(faucetAddress);
        console.log(`  🚰 Current faucet balance: ${ethers.formatEther(currentBalance)} ETH`);

        // Send a reasonable amount for gas fees (0.1 ETH)
        const sendAmount = ethers.parseEther("0.1");

        if (deployerBalance < sendAmount) {
            console.log(`  ⚠️ Deployer doesn't have enough for 0.1 ETH, sending available amount minus gas`);
            const gasReserve = ethers.parseEther("0.01"); // Reserve for gas
            const availableAmount = deployerBalance - gasReserve;

            if (availableAmount <= 0n) {
                console.log(`  ❌ Not enough balance to send any native tokens`);
                return { success: false, error: 'Insufficient balance for transfer' };
            }

            console.log(`  📤 Transferring ${ethers.formatEther(availableAmount)} ETH...`);
            const tx = await deployerWallet.sendTransaction({
                to: faucetAddress,
                value: availableAmount,
                gasLimit: 21000
            });

            const receipt = await tx.wait();
            console.log(`  ✅ Transfer completed! Gas used: ${receipt.gasUsed}`);

            return {
                success: true,
                amount: availableAmount.toString(),
                formatted: ethers.formatEther(availableAmount),
                tx_hash: tx.hash,
                gas_used: receipt.gasUsed.toString()
            };
        } else {
            console.log(`  📤 Transferring ${ethers.formatEther(sendAmount)} ETH...`);
            const tx = await deployerWallet.sendTransaction({
                to: faucetAddress,
                value: sendAmount,
                gasLimit: 21000
            });

            const receipt = await tx.wait();
            console.log(`  ✅ Transfer completed! Gas used: ${receipt.gasUsed}`);

            return {
                success: true,
                amount: sendAmount.toString(),
                formatted: ethers.formatEther(sendAmount),
                tx_hash: tx.hash,
                gas_used: receipt.gasUsed.toString()
            };
        }

    } catch (error) {
        console.log(`  ❌ Failed to fund with native tokens: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function main() {
    console.log('\n💰 FAUCET FUNDING SCRIPT');
    console.log('========================\n');

    try {
        // Initialize provider and wallets
        const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        const deployerWallet = ethers.Wallet.fromPhrase(config.blockchain.sender.mnemonic, provider);
        const faucetAddress = "0x42e6047c5780B103E52265F6483C2d0113aA6B87"; // Specific faucet address

        console.log('🔧 Setup:');
        console.log(`  Provider: ${config.blockchain.endpoints.evm_endpoint}`);
        console.log(`  Deployer: ${deployerWallet.address}`);
        console.log(`  Faucet: ${faucetAddress}`);
        console.log(`  Network: ${(await provider.getNetwork()).chainId}`);

        // Check if deployer and faucet are the same
        if (deployerWallet.address.toLowerCase() === faucetAddress.toLowerCase()) {
            console.log(`  ℹ️ Deployer and faucet are the same address - checking balances only`);
        }

        const results = [];

        // Fund with native tokens first
        const nativeResult = await fundWithNative(provider, deployerWallet, faucetAddress);
        results.push({ type: 'native', ...nativeResult });

        // Fund with each ERC20 token
        for (const tokenConfig of config.blockchain.tx.amounts) {
            const result = await fundWithERC20(provider, deployerWallet, tokenConfig, faucetAddress);
            results.push({
                type: 'erc20',
                denom: tokenConfig.denom,
                contract: tokenConfig.erc20_contract,
                ...result
            });
        }

        // Summary
        console.log('\n📊 FUNDING SUMMARY');
        console.log('==================');

        const successful = results.filter(r => r.success && !r.skipped && !r.sufficient);
        const sufficient = results.filter(r => r.sufficient);
        const skipped = results.filter(r => r.skipped);
        const failed = results.filter(r => !r.success);

        console.log(`✅ Successful transfers: ${successful.length}`);
        console.log(`✅ Already sufficient: ${sufficient.length}`);
        console.log(`⏭️ Skipped: ${skipped.length}`);
        console.log(`❌ Failed: ${failed.length}`);

        if (successful.length > 0) {
            console.log('\n✅ Successful transfers:');
            successful.forEach(result => {
                const token = result.type === 'native' ? 'ETH' : result.denom;
                console.log(`  - ${token}: ${result.formatted} (${result.tx_hash})`);
            });
        }

        if (sufficient.length > 0) {
            console.log('\n✅ Already sufficient:');
            sufficient.forEach(result => {
                const token = result.type === 'native' ? 'ETH' : result.denom;
                console.log(`  - ${token}: Already funded`);
            });
        }

        if (failed.length > 0) {
            console.log('\n❌ Failed transfers:');
            failed.forEach(result => {
                const token = result.type === 'native' ? 'ETH' : result.denom;
                console.log(`  - ${token}: ${result.error}`);
            });
        }

        // Final balance check
        console.log('\n🔍 Final Faucet Balances:');

        // Native balance
        const finalNativeBalance = await provider.getBalance(faucetAddress);
        console.log(`  ETH: ${ethers.formatEther(finalNativeBalance)}`);

        // ERC20 balances
        for (const tokenConfig of config.blockchain.tx.amounts) {
            if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
                continue;
            }

            try {
                const tokenContract = new ethers.Contract(
                    tokenConfig.erc20_contract,
                    ["function balanceOf(address) view returns (uint256)"],
                    provider
                );

                const balance = await tokenContract.balanceOf(faucetAddress);
                const formatted = ethers.formatUnits(balance, tokenConfig.decimals);
                console.log(`  ${tokenConfig.denom}: ${formatted}`);
            } catch (error) {
                console.log(`  ${tokenConfig.denom}: Error checking balance`);
            }
        }

        console.log('\n🎉 Faucet funding completed!');

    } catch (error) {
        console.error('\n💥 Funding script failed:', error);
        process.exit(1);
    }
}

// Run the funding
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('\n💥 FAUCET FUNDING FAILED:', error);
        process.exit(1);
    });
}

export { main as fundFaucet };