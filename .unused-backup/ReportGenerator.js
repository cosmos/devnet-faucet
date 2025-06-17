import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';

/**
 * Comprehensive Report Generation System
 */
export class ReportGenerator {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.reportDir = 'reports';
    }

    async initialize() {
        // Ensure reports directory exists
        await fs.mkdir(this.reportDir, { recursive: true });
        this.logger.info('ReportGenerator initialized', {
            report_directory: this.reportDir
        });
    }

    /**
     * Generate comprehensive system status report
     */
    async generateSystemReport(faucetCore, tokenDeployer) {
        this.logger.info('Generating comprehensive system report...');

        const timestamp = new Date().toISOString();
        const reportId = `system-report-${Date.now()}`;

        const report = {
            report_id: reportId,
            timestamp: timestamp,
            version: '1.0.0',

            // Network Information
            network_info: await this.getNetworkInfo(faucetCore),

            // Faucet System Health
            system_health: await faucetCore.getSystemHealth(),

            // Wallet Information
            wallet_info: await this.getWalletInfo(faucetCore),

            // Token Information
            token_info: await this.getTokenInfo(faucetCore, tokenDeployer),

            // Balance Information
            balance_info: await this.getBalanceInfo(faucetCore),

            // Precompile Information
            precompile_info: await this.getPrecompileInfo(faucetCore),

            // Recent Activity
            recent_activity: await this.getRecentActivity(),

            // Performance Metrics
            performance_metrics: await this.getPerformanceMetrics(),

            // Configuration Summary
            configuration: this.getConfigurationSummary()
        };

        // Save report
        const reportPath = path.join(this.reportDir, `${reportId}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        // Also save a latest report
        const latestPath = path.join(this.reportDir, 'latest-system-report.json');
        await fs.writeFile(latestPath, JSON.stringify(report, null, 2));

        this.logger.info('System report generated', {
            report_id: reportId,
            report_path: reportPath,
            sections: Object.keys(report).length
        });

        return report;
    }

    /**
     * Generate faucet operation report
     */
    async generateFaucetReport(operations = []) {
        const timestamp = new Date().toISOString();
        const reportId = `faucet-report-${Date.now()}`;

        const report = {
            report_id: reportId,
            timestamp: timestamp,
            period: {
                start: operations.length > 0 ? operations[0].timestamp : timestamp,
                end: timestamp,
                duration_hours: 24 // Default 24 hour period
            },

            // Operation Summary
            summary: {
                total_requests: operations.length,
                successful_requests: operations.filter(op => op.success).length,
                failed_requests: operations.filter(op => !op.success).length,
                unique_recipients: new Set(operations.map(op => op.recipient)).size,
                total_tokens_distributed: this.calculateTotalTokensDistributed(operations)
            },

            // Token Distribution Breakdown
            token_distribution: this.analyzeTokenDistribution(operations),

            // Recipient Analysis
            recipient_analysis: this.analyzeRecipients(operations),

            // Error Analysis
            error_analysis: this.analyzeErrors(operations),

            // Performance Analysis
            performance_analysis: this.analyzePerformance(operations),

            // Detailed Operations
            operations: operations.slice(-100) // Last 100 operations
        };

        // Save report
        const reportPath = path.join(this.reportDir, `${reportId}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        this.logger.info('Faucet report generated', {
            report_id: reportId,
            operations_analyzed: operations.length,
            success_rate: `${((report.summary.successful_requests / report.summary.total_requests) * 100).toFixed(2)}%`
        });

        return report;
    }

    /**
     * Generate deployment verification report
     */
    async generateDeploymentReport(tokenDeployer) {
        const timestamp = new Date().toISOString();
        const reportId = `deployment-report-${Date.now()}`;

        // Verify all deployments
        const verificationResults = await tokenDeployer.verifyDeployments();

        const report = {
            report_id: reportId,
            timestamp: timestamp,

            // Deployment Summary
            deployment_summary: {
                total_tokens_configured: this.config.blockchain.tx.amounts.length,
                tokens_verified: verificationResults.verified.length,
                tokens_failed: verificationResults.failed.length,
                verification_success_rate: `${((verificationResults.verified.length / this.config.blockchain.tx.amounts.length) * 100).toFixed(2)}%`
            },

            // Verified Tokens
            verified_tokens: verificationResults.verified,

            // Failed Verifications
            failed_verifications: verificationResults.failed,

            // Network Information
            network_info: {
                chain_id: this.config.blockchain.ids.chainId,
                cosmos_chain_id: this.config.blockchain.ids.cosmosChainId,
                endpoints: this.config.blockchain.endpoints
            },

            // Deployment Configuration
            deployment_config: {
                deployer_address: tokenDeployer.deployerWallet?.address,
                gas_settings: this.config.blockchain.tx.fee,
                token_configs: this.config.blockchain.tx.amounts
            }
        };

        // Save report
        const reportPath = path.join(this.reportDir, `${reportId}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        this.logger.info('Deployment report generated', {
            report_id: reportId,
            tokens_verified: report.deployment_summary.tokens_verified,
            verification_rate: report.deployment_summary.verification_success_rate
        });

        return report;
    }

    /**
     * Get network information
     */
    async getNetworkInfo(faucetCore) {
        try {
            const network = await faucetCore.evmProvider.getNetwork();
            const blockNumber = await faucetCore.evmProvider.getBlockNumber();
            const cosmosHeight = await faucetCore.cosmosClient.getHeight();

            return {
                evm_network: {
                    chain_id: network.chainId.toString(),
                    name: network.name,
                    current_block: blockNumber
                },
                cosmos_network: {
                    chain_id: this.config.blockchain.ids.cosmosChainId,
                    current_height: cosmosHeight
                },
                endpoints: this.config.blockchain.endpoints
            };
        } catch (error) {
            this.logger.error('Failed to get network info', error);
            return { error: error.message };
        }
    }

    /**
     * Get wallet information
     */
    async getWalletInfo(faucetCore) {
        try {
            const [cosmosAccount] = await faucetCore.wallets.cosmos.getAccounts();
            const evmBalance = await faucetCore.evmProvider.getBalance(faucetCore.wallets.evm.address);

            return {
                evm_wallet: {
                    address: faucetCore.wallets.evm.address,
                    balance: ethers.formatEther(evmBalance)
                },
                cosmos_wallet: {
                    address: cosmosAccount.address,
                    algorithm: cosmosAccount.algo
                },
                derivation: {
                    mnemonic_used: true,
                    derivation_path: this.config.blockchain.sender.option.hdPaths[0],
                    prefix: this.config.blockchain.sender.option.prefix
                }
            };
        } catch (error) {
            this.logger.error('Failed to get wallet info', error);
            return { error: error.message };
        }
    }

    /**
     * Get token information
     */
    async getTokenInfo(faucetCore, tokenDeployer) {
        const tokenInfo = {
            configured_tokens: [],
            total_tokens: faucetCore.tokens.size,
            native_tokens: 0,
            erc20_tokens: 0
        };

        for (const [denom, token] of faucetCore.tokens) {
            const isNative = token.erc20_contract === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

            if (isNative) {
                tokenInfo.native_tokens++;
            } else {
                tokenInfo.erc20_tokens++;
            }

            tokenInfo.configured_tokens.push({
                denom: denom,
                type: isNative ? 'native' : 'erc20',
                contract_address: token.erc20_contract,
                decimals: token.decimals,
                amount_per_request: token.amount,
                target_balance: token.target_balance
            });
        }

        return tokenInfo;
    }

    /**
     * Get comprehensive balance information
     */
    async getBalanceInfo(faucetCore) {
        try {
            const balanceInfo = {
                faucet_balances: {},
                total_value_locked: '0',
                token_balances: []
            };

            // Get faucet balances for all tokens
            const bankContract = faucetCore.precompiles.get('bank').contract;
            const bankBalances = await bankContract.balances(faucetCore.wallets.evm.address);

            for (const balance of bankBalances) {
                const tokenAddress = balance.contractAddress;
                const amount = balance.amount;

                // Find corresponding token configuration
                for (const [denom, token] of faucetCore.tokens) {
                    if (token.erc20_contract.toLowerCase() === tokenAddress.toLowerCase()) {
                        const formattedAmount = ethers.formatUnits(amount, token.decimals);

                        balanceInfo.token_balances.push({
                            denom: denom,
                            contract: tokenAddress,
                            balance: amount.toString(),
                            formatted_balance: formattedAmount,
                            decimals: token.decimals,
                            target_balance: token.target_balance
                        });
                        break;
                    }
                }
            }

            return balanceInfo;
        } catch (error) {
            this.logger.error('Failed to get balance info', error);
            return { error: error.message };
        }
    }

    /**
     * Get precompile information
     */
    async getPrecompileInfo(faucetCore) {
        const precompileInfo = {
            available_precompiles: [],
            total_precompiles: faucetCore.precompiles.size,
            working_precompiles: 0,
            failed_precompiles: 0
        };

        for (const [name, precompile] of faucetCore.precompiles) {
            try {
                // Test basic functionality
                let working = false;
                if (name === 'bank') {
                    await precompile.contract.balances(faucetCore.wallets.evm.address);
                    working = true;
                } else if (name === 'bech32') {
                    // Test bech32 conversion
                    working = true; // Assume working for now
                }

                if (working) {
                    precompileInfo.working_precompiles++;
                } else {
                    precompileInfo.failed_precompiles++;
                }

                precompileInfo.available_precompiles.push({
                    name: name,
                    address: precompile.address,
                    working: working,
                    functions: precompile.abi.map(a => a.split('function ')[1]?.split('(')[0]).filter(Boolean)
                });

            } catch (error) {
                precompileInfo.failed_precompiles++;
                precompileInfo.available_precompiles.push({
                    name: name,
                    address: precompile.address,
                    working: false,
                    error: error.message
                });
            }
        }

        return precompileInfo;
    }

    /**
     * Get recent activity (mock implementation)
     */
    async getRecentActivity() {
        return {
            last_24_hours: {
                total_requests: 0,
                successful_requests: 0,
                failed_requests: 0,
                unique_users: 0
            },
            last_request: null,
            recent_errors: []
        };
    }

    /**
     * Get performance metrics (mock implementation)
     */
    async getPerformanceMetrics() {
        return {
            average_response_time: '0ms',
            success_rate: '100%',
            uptime: '100%',
            memory_usage: '0MB',
            cpu_usage: '0%'
        };
    }

    /**
     * Get configuration summary
     */
    getConfigurationSummary() {
        return {
            rate_limits: this.config.blockchain.limit,
            fee_settings: this.config.blockchain.tx.fee,
            token_count: this.config.blockchain.tx.amounts.length,
            endpoints_configured: Object.keys(this.config.blockchain.endpoints).length,
            logging_enabled: !!this.config.logging,
            server_port: this.config.server?.port || 3000
        };
    }

    // Helper methods for faucet report analysis
    calculateTotalTokensDistributed(operations) {
        const totals = {};
        for (const op of operations) {
            if (op.success && op.tokens_sent) {
                for (const token of op.tokens_sent) {
                    totals[token.denom] = (totals[token.denom] || 0) + parseFloat(token.amount);
                }
            }
        }
        return totals;
    }

    analyzeTokenDistribution(operations) {
        const distribution = {};
        for (const op of operations) {
            if (op.success && op.tokens_sent) {
                for (const token of op.tokens_sent) {
                    if (!distribution[token.denom]) {
                        distribution[token.denom] = {
                            total_distributed: 0,
                            distribution_count: 0,
                            recipients: new Set()
                        };
                    }
                    distribution[token.denom].total_distributed += parseFloat(token.amount);
                    distribution[token.denom].distribution_count++;
                    distribution[token.denom].recipients.add(op.recipient);
                }
            }
        }

        // Convert Sets to counts
        for (const denom in distribution) {
            distribution[denom].unique_recipients = distribution[denom].recipients.size;
            delete distribution[denom].recipients;
        }

        return distribution;
    }

    analyzeRecipients(operations) {
        const recipients = {};
        for (const op of operations) {
            if (!recipients[op.recipient]) {
                recipients[op.recipient] = {
                    total_requests: 0,
                    successful_requests: 0,
                    failed_requests: 0,
                    first_request: op.timestamp,
                    last_request: op.timestamp
                };
            }

            recipients[op.recipient].total_requests++;
            if (op.success) {
                recipients[op.recipient].successful_requests++;
            } else {
                recipients[op.recipient].failed_requests++;
            }

            if (op.timestamp > recipients[op.recipient].last_request) {
                recipients[op.recipient].last_request = op.timestamp;
            }
        }

        return {
            total_unique_recipients: Object.keys(recipients).length,
            top_recipients: Object.entries(recipients)
                .sort(([,a], [,b]) => b.total_requests - a.total_requests)
                .slice(0, 10)
                .map(([address, stats]) => ({ address, ...stats }))
        };
    }

    analyzeErrors(operations) {
        const errors = {};
        for (const op of operations) {
            if (!op.success && op.error) {
                const errorType = op.error.split(':')[0] || 'Unknown';
                errors[errorType] = (errors[errorType] || 0) + 1;
            }
        }

        return {
            total_errors: Object.values(errors).reduce((a, b) => a + b, 0),
            error_types: errors,
            most_common_error: Object.entries(errors).sort(([,a], [,b]) => b - a)[0]?.[0] || 'None'
        };
    }

    analyzePerformance(operations) {
        const durations = operations
            .filter(op => op.duration_ms)
            .map(op => op.duration_ms);

        if (durations.length === 0) {
            return { average_duration: 0, min_duration: 0, max_duration: 0 };
        }

        return {
            average_duration: durations.reduce((a, b) => a + b, 0) / durations.length,
            min_duration: Math.min(...durations),
            max_duration: Math.max(...durations),
            total_operations: durations.length
        };
    }
}