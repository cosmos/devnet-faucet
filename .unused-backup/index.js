import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { FaucetCore } from './FaucetCore.js';
import { TokenDeployer } from './TokenDeployer.js';
import { ReportGenerator } from './ReportGenerator.js';
import config from '../config.js';

/**
 * Main Faucet Application
 * Comprehensive dual-environment faucet with proper logging and deployment tools
 */
class FaucetApplication {
    constructor() {
        this.app = express();
        this.faucetCore = null;
        this.tokenDeployer = null;
        this.reportGenerator = null;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // CORS
        this.app.use(cors());

        // JSON parsing
        this.app.use(express.json());

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100 // limit each IP to 100 requests per windowMs
        });
        this.app.use(limiter);

        // Static files
        this.app.use(express.static('public'));
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', this.handleHealthCheck.bind(this));

        // Main faucet endpoint
        this.app.post('/faucet', this.handleFaucetRequest.bind(this));

        // Admin endpoints
        this.app.post('/admin/deploy-tokens', this.handleTokenDeployment.bind(this));
        this.app.get('/admin/report', this.handleReportGeneration.bind(this));
        this.app.get('/admin/status', this.handleStatusCheck.bind(this));

        // Balance check endpoint
        this.app.get('/balance/:address', this.handleBalanceCheck.bind(this));
    }

    async initialize() {
        console.log('Initializing Faucet Application...');

        try {
            // Initialize core systems
            this.faucetCore = new FaucetCore({
                ...config,
                logging: {
                    file: 'logs/faucet.log',
                    level: 'info'
                },
                limits: config.blockchain.limit
            });

            await this.faucetCore.initialize();

            // Initialize support systems
            this.tokenDeployer = new TokenDeployer(config, this.faucetCore.wallets.evm);
            this.reportGenerator = new ReportGenerator(config, this.faucetCore);

            console.log('Faucet Application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Faucet Application:', error);
            throw error;
        }
    }

    async handleHealthCheck(req, res) {
        try {
            const health = await this.faucetCore.getSystemHealth();
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                ...health
            });
        } catch (error) {
            res.status(500).json({
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async handleFaucetRequest(req, res) {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        try {
            const result = await this.faucetCore.dispenseFunds(address);
            res.json(result);
        } catch (error) {
            console.error('Faucet request failed:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async handleTokenDeployment(req, res) {
        const { tokens } = req.body;

        try {
            const result = await this.tokenDeployer.deployTokens(tokens);
            res.json({
                success: true,
                deployments: result
            });
        } catch (error) {
            console.error('Token deployment failed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async handleReportGeneration(req, res) {
        try {
            const report = await this.reportGenerator.generateFullReport();
            res.json({
                success: true,
                report
            });
        } catch (error) {
            console.error('Report generation failed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async handleStatusCheck(req, res) {
        try {
            const status = await this.faucetCore.generateDeploymentReport();
            res.json({
                success: true,
                status
            });
        } catch (error) {
            console.error('Status check failed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    async handleBalanceCheck(req, res) {
        const { address } = req.params;

        try {
            const addressInfo = this.faucetCore.analyzeAddress(address);
            const balances = await this.faucetCore.checkRecipientBalances(addressInfo);

            res.json({
                success: true,
                address: addressInfo,
                balances: Object.fromEntries(balances)
            });
        } catch (error) {
            console.error('Balance check failed:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async start() {
        await this.initialize();

        const port = config.port || 8088;
        this.app.listen(port, () => {
            console.log(`Faucet server running on port ${port}`);
            console.log(`Health check: http://localhost:${port}/health`);
            console.log(`Faucet endpoint: POST http://localhost:${port}/faucet`);
            console.log(`Admin panel: http://localhost:${port}/admin/status`);
        });
    }
}

// Start the application
const faucetApp = new FaucetApplication();
faucetApp.start().catch(console.error);

export default FaucetApplication;