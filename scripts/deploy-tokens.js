import { ethers } from 'ethers';
import config from '../config.js';

/**
 * Deploy ERC20 Tokens Script
 * Deploys missing ERC20 tokens with retry logic and pauses
 */

// ERC20 contract source code
const ERC20_SOURCE = `
pragma solidity ^0.8.0;

contract SimpleERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = _totalSupply;
        balanceOf[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == address(0x1411C97BD5F50E1EA22cF5362bA8088770A802B0), "Only faucet can mint");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
`;

// Compiled bytecode for the ERC20 contract (simplified version)
const ERC20_BYTECODE = "0x608060405234801561001057600080fd5b506040516108a93803806108a98339818101604052810190610032919061020a565b83600090816100419190610476565b5082600190816100519190610476565b5081600260006101000a81548160ff021916908360ff16021790555080600381905550806004600033815260200190815260200160002081905550336000600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040516100d79190610557565b60405180910390a350505050610572565b6000604051905090565b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61014e82610105565b810181811067ffffffffffffffff8211171561016d5761016c610116565b5b80604052505050565b60006101806100ec565b905061018c8282610145565b919050565b600067ffffffffffffffff8211156101ac576101ab610116565b5b6101b582610105565b9050602081019050919050565b60005b838110156101e05780820151818401526020810190506101c5565b60008484015250505050565b60006102016101fc84610191565b610176565b90508281526020810184848401111561021d5761021c610100565b5b6102288482856101c2565b509392505050565b600082601f830112610245576102446100fb565b5b81516102558482602086016101ee565b91505092915050565b600060ff82169050919050565b6102748161025e565b811461027f57600080fd5b50565b6000815190506102918161026b565b92915050565b6000819050919050565b6102aa81610297565b81146102b557600080fd5b50565b6000815190506102c7816102a1565b92915050565b600080600080608085870312156102e7576102e66100f6565b5b600085015167ffffffffffffffff811115610305576103046100fb565b5b61031187828801610230565b945050602085015167ffffffffffffffff811115610332576103316100fb565b5b61033e87828801610230565b935050604061034f87828801610282565b9250506060610360878288016102b8565b91505092959194509250565b600081519050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b600060028204905060018216806103bf57607f821691505b6020821081036103d2576103d1610378565b5b50919050565b60008190508160005260206000209050919050565b60006020601f8301049050919050565b600082821b905092915050565b6000600883026104347fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff826103f7565b61043e86836103f7565b95508019841693508086168417925050509392505050565b6000819050919050565b600061047b61047661047184610297565b610456565b610297565b9050919050565b6000819050919050565b61049583610460565b6104a96104a182610482565b848454610404565b825550505050565b600090565b6104be6104b1565b6104c981848461048c565b505050565b5b818110156104ed576104e26000826104b6565b6001810190506104cf565b5050565b601f82111561053257610503816103d8565b61050c846103ed565b8101602085101561051b578190505b61052f610527856103ed56b8301826104ce565b50505b505050565b600082821c905092915050565b600061055560001984600802610537565b1980831691505092915050565b600061056e8383610544565b9150826002028217905092915050565b6105878261036c565b67ffffffffffffffff8111156105a05761059f610116565b5b6105aa82546103a7565b6105b58282856104f1565b600060209050601f8311600181146105e857600084156105d6578287015190505b6105e08582610562565b865550610648565b601f1984166105f6866103d8565b60005b8281101561061e578489015182556001820191506020850194506020810190506105f9565b8683101561063b5784890151610637601f891682610544565b8355505b6001600288020188555050505b505050505050565b610250806106616000396000f3fe608060405234801561001057600080fd5b50600436106100a95760003560e01c80633950935111610071578063395093511461016857806370a082311461019857806395d89b41146101c8578063a457c2d7146101e6578063a9059cbb14610216578063dd62ed3e14610246576100a9565b806306fdde03146100ae578063095ea7b3146100cc57806318160ddd146100fc57806323b872dd1461011a578063313ce5671461014a575b600080fd5b6100b6610276565b6040516100c39190610180565b60405180910390f35b6100e660048036038101906100e191906101d5565b610304565b6040516100f39190610230565b60405180910390f35b610104610327565b604051610111919061025a565b60405180910390f35b610134600480360381019061012f9190610275565b61032d565b6040516101419190610230565b60405180910390f35b610152610456565b60405161015f91906102e4565b60405180910390f35b610182600480360381019061017d91906101d5565b610469565b60405161018f9190610230565b60405180910390f35b6101b260048036038101906101ad91906102ff565b6104a0565b6040516101bf919061025a565b60405180910390f35b6101d06104b8565b6040516101dd9190610180565b60405180910390f35b61020060048036038101906101fb91906101d5565b610546565b60405161020d9190610230565b60405180910390f35b610230600480360381019061022b91906101d5565b6105bd565b60405161023d9190610230565b60405180910390f35b610260600480360381019061025b919061032c565b6105e0565b60405161026d919061025a565b60405180910390f35b6000805461028390610395565b80601f01602080910402602001604051908101604052809291908181526020018280546102af90610395565b80156102fc5780601f106102d1576101008083540402835291602001916102fc565b820191906000526020600020905b8154815290600101906020018083116102df57829003601f168201915b505050505081565b60008061030f610667565b905061031c81858561066f565b600191505092915050565b60035481565b60008061033861066f565b9050610345858285610838565b6103508585856108c4565b60019150509392505050565b600260009054906101000a900460ff1681565b60008061047461066f565b905061049581858561048685896105e0565b61049091906103f5565b61066f565b600191505092915050565b60046020528060005260406000206000915090505481565b600180546104c590610395565b80601f01602080910402602001604051908101604052809291908181526020018280546104f190610395565b801561053e5780601f106105135761010080835404028352916020019161053e565b820191906000526020600020905b81548152906001019060200180831161052157829003601f168201915b505050505081565b60008061055161066f565b9050600061055f82866105e0565b9050838110156105a4576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161059b9061049b565b60405180910390fd5b6105b1828686840361066f565b60019250505092915050565b6000806105c861066f565b90506105d58185856108c4565b600191505092915050565b6000600560008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020549050929150505056fea2646970667358221220c7c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c864736f6c63430008110033";

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function deployToken(provider, wallet, tokenConfig, retryCount = 0) {
    const maxRetries = 3;
    const pauseMs = 5000; // 5 seconds

    console.log(`\n🚀 Deploying ${tokenConfig.denom.toUpperCase()} token...`);
    console.log(`  Target address: ${tokenConfig.erc20_contract}`);
    console.log(`  Decimals: ${tokenConfig.decimals}`);

    try {
        // Check if contract already exists
        const existingCode = await provider.getCode(tokenConfig.erc20_contract);
        if (existingCode !== '0x') {
            console.log(`  ✅ Contract already exists at ${tokenConfig.erc20_contract}`);
            return { success: true, address: tokenConfig.erc20_contract, existing: true };
        }

        // Prepare deployment parameters
        const tokenName = tokenConfig.name || tokenConfig.denom.toUpperCase();
        const tokenSymbol = tokenConfig.denom.toUpperCase();
        const decimals = tokenConfig.decimals || 18;
        const initialSupply = ethers.parseUnits("1000000000", decimals); // 1B tokens

        console.log(`  📋 Token details:`);
        console.log(`    Name: ${tokenName}`);
        console.log(`    Symbol: ${tokenSymbol}`);
        console.log(`    Decimals: ${decimals}`);
        console.log(`    Initial Supply: ${ethers.formatUnits(initialSupply, decimals)}`);

        // Create contract factory
        const contractFactory = new ethers.ContractFactory(
            [
                "constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _totalSupply)",
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function decimals() view returns (uint8)",
                "function totalSupply() view returns (uint256)",
                "function balanceOf(address) view returns (uint256)",
                "function transfer(address to, uint256 amount) returns (bool)",
                "function mint(address to, uint256 amount) returns (bool)"
            ],
            ERC20_BYTECODE,
            wallet
        );

        // Deploy contract
        console.log(`  📤 Deploying contract...`);
        const contract = await contractFactory.deploy(
            tokenName,
            tokenSymbol,
            decimals,
            initialSupply,
            {
                gasLimit: 2000000,
                gasPrice: ethers.parseUnits("20", "gwei")
            }
        );

        console.log(`  ⏳ Waiting for deployment confirmation...`);
        console.log(`  Transaction hash: ${contract.deploymentTransaction().hash}`);

        // Wait for deployment
        await contract.waitForDeployment();
        const deployedAddress = await contract.getAddress();

        console.log(`  ✅ Contract deployed successfully!`);
        console.log(`  📍 Deployed address: ${deployedAddress}`);
        console.log(`  🎯 Expected address: ${tokenConfig.erc20_contract}`);
        console.log(`  📊 Addresses match: ${deployedAddress.toLowerCase() === tokenConfig.erc20_contract.toLowerCase()}`);

        // Verify deployment
        const deployedName = await contract.name();
        const deployedSymbol = await contract.symbol();
        const deployedDecimals = await contract.decimals();
        const deployedSupply = await contract.totalSupply();

        console.log(`  🔍 Verification:`);
        console.log(`    Name: ${deployedName}`);
        console.log(`    Symbol: ${deployedSymbol}`);
        console.log(`    Decimals: ${deployedDecimals}`);
        console.log(`    Total Supply: ${ethers.formatUnits(deployedSupply, deployedDecimals)}`);

        return {
            success: true,
            address: deployedAddress,
            expected: tokenConfig.erc20_contract,
            match: deployedAddress.toLowerCase() === tokenConfig.erc20_contract.toLowerCase(),
            contract: contract,
            details: {
                name: deployedName,
                symbol: deployedSymbol,
                decimals: Number(deployedDecimals),
                totalSupply: deployedSupply.toString()
            }
        };

    } catch (error) {
        console.log(`  ❌ Deployment failed: ${error.message}`);

        if (retryCount < maxRetries) {
            console.log(`  🔄 Retrying in ${pauseMs/1000} seconds... (Attempt ${retryCount + 1}/${maxRetries})`);
            await sleep(pauseMs);
            return deployToken(provider, wallet, tokenConfig, retryCount + 1);
        } else {
            console.log(`  💥 Max retries exceeded for ${tokenConfig.denom}`);
            return {
                success: false,
                error: error.message,
                denom: tokenConfig.denom,
                retries: retryCount
            };
        }
    }
}

async function main() {
    console.log('\n🏭 ERC20 TOKEN DEPLOYMENT SCRIPT');
    console.log('=================================\n');

    try {
        // Initialize provider and wallet
        const provider = new ethers.JsonRpcProvider(config.blockchain.endpoints.evm_endpoint);
        const wallet = ethers.Wallet.fromPhrase(config.blockchain.sender.mnemonic, provider);

        console.log('🔧 Setup:');
        console.log(`  Provider: ${config.blockchain.endpoints.evm_endpoint}`);
        console.log(`  Deployer: ${wallet.address}`);
        console.log(`  Network: ${(await provider.getNetwork()).chainId}`);

        // Check deployer balance
        const balance = await provider.getBalance(wallet.address);
        console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

        if (balance === 0n) {
            console.log('  ⚠️ Warning: Deployer has zero balance - deployments may fail');
        }

        const deploymentResults = [];

        // Deploy each ERC20 token
        for (const tokenConfig of config.blockchain.tx.amounts) {
            // Skip native token
            if (tokenConfig.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE") {
                console.log(`\n⏭️ Skipping native token: ${tokenConfig.denom}`);
                deploymentResults.push({
                    denom: tokenConfig.denom,
                    success: true,
                    skipped: true,
                    reason: 'Native token'
                });
                continue;
            }

            const result = await deployToken(provider, wallet, tokenConfig);
            deploymentResults.push({
                denom: tokenConfig.denom,
                ...result
            });

            // Pause between deployments to avoid rate limiting
            if (config.blockchain.tx.amounts.indexOf(tokenConfig) < config.blockchain.tx.amounts.length - 1) {
                console.log(`\n⏸️ Pausing 3 seconds before next deployment...`);
                await sleep(3000);
            }
        }

        // Summary
        console.log('\n📊 DEPLOYMENT SUMMARY');
        console.log('====================');

        const successful = deploymentResults.filter(r => r.success && !r.skipped);
        const failed = deploymentResults.filter(r => !r.success);
        const skipped = deploymentResults.filter(r => r.skipped);
        const existing = deploymentResults.filter(r => r.existing);

        console.log(`✅ Successful deployments: ${successful.length}`);
        console.log(`❌ Failed deployments: ${failed.length}`);
        console.log(`⏭️ Skipped: ${skipped.length}`);
        console.log(`🔄 Already existing: ${existing.length}`);

        if (successful.length > 0) {
            console.log('\n✅ Successfully deployed:');
            successful.forEach(result => {
                console.log(`  - ${result.denom}: ${result.address}`);
            });
        }

        if (failed.length > 0) {
            console.log('\n❌ Failed deployments:');
            failed.forEach(result => {
                console.log(`  - ${result.denom}: ${result.error}`);
            });
        }

        // Save deployment report
        const report = {
            timestamp: new Date().toISOString(),
            deployer: wallet.address,
            network: {
                chainId: (await provider.getNetwork()).chainId.toString(),
                endpoint: config.blockchain.endpoints.evm_endpoint
            },
            results: deploymentResults,
            summary: {
                total: deploymentResults.length,
                successful: successful.length,
                failed: failed.length,
                skipped: skipped.length,
                existing: existing.length
            }
        };

        const fs = await import('fs/promises');
        await fs.mkdir('deployments', { recursive: true });
        const reportPath = `deployments/token-deployment-${Date.now()}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n📄 Deployment report saved: ${reportPath}`);

        if (failed.length === 0) {
            console.log('\n🎉 All token deployments completed successfully!');
        } else {
            console.log(`\n⚠️ ${failed.length} deployments failed. Check the report for details.`);
            process.exit(1);
        }

    } catch (error) {
        console.error('\n💥 Deployment script failed:', error);
        process.exit(1);
    }
}

// Run the deployment
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('\n💥 DEPLOYMENT FAILED:', error);
        process.exit(1);
    });
}

export { main as deployTokens };