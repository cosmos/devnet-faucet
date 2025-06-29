/**
 * TokenAllowanceTracker - 24-hour token allowance rate limiting
 * Tracks cumulative token amounts distributed per address in a 24-hour window
 */

import fs from 'fs';
import path from 'path';

export class TokenAllowanceTracker {
    constructor(config) {
        this.config = config;
        this.dbPath = config.db?.allowancePath || '.faucet/allowances.db';
        
        // Daily limits per token type (in smallest units)
        this.dailyLimits = new Map();
        this.initializeLimits();
        
        // In-memory storage: address -> { tokenDenom -> { amount, timestamps[] } }
        this.allowances = new Map();
        
        // Ensure db directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // Load existing data
        this.loadData();
        
        // Cleanup old entries periodically
        setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
    }
    
    /**
     * Initialize daily limits based on config
     */
    initializeLimits() {
        const tokens = this.config.blockchain?.tx?.amounts || [];
        
        for (const token of tokens) {
            // Set daily limit to 10x the single faucet amount
            const singleAmount = BigInt(token.amount || "0");
            const dailyLimit = singleAmount * 10n;
            this.dailyLimits.set(token.denom, dailyLimit);
        }
    }
    
    /**
     * Load persisted allowance data
     */
    loadData() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                const parsed = JSON.parse(data);
                
                // Convert stored data back to Map structure
                this.allowances = new Map();
                for (const [address, tokens] of Object.entries(parsed.allowances || {})) {
                    const tokenMap = new Map();
                    for (const [denom, info] of Object.entries(tokens)) {
                        tokenMap.set(denom, {
                            amount: BigInt(info.amount),
                            timestamps: info.timestamps
                        });
                    }
                    this.allowances.set(address, tokenMap);
                }
                
                console.log(` Loaded token allowance data for ${this.allowances.size} addresses`);
            }
        } catch (error) {
            console.warn('  Could not load allowance data:', error.message);
            this.allowances = new Map();
        }
    }
    
    /**
     * Save allowance data to disk
     */
    saveData() {
        try {
            // Convert Maps to plain objects for JSON serialization
            const allowancesObj = {};
            for (const [address, tokens] of this.allowances.entries()) {
                allowancesObj[address] = {};
                for (const [denom, info] of tokens.entries()) {
                    allowancesObj[address][denom] = {
                        amount: info.amount.toString(),
                        timestamps: info.timestamps
                    };
                }
            }
            
            const data = {
                allowances: allowancesObj,
                lastSaved: new Date().toISOString()
            };
            
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('  Could not save allowance data:', error.message);
        }
    }
    
    /**
     * Clean up old entries outside the 24-hour window
     */
    cleanup() {
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        let cleaned = 0;
        
        for (const [address, tokens] of this.allowances.entries()) {
            let hasValidTokens = false;
            
            for (const [denom, info] of tokens.entries()) {
                const validTimestamps = info.timestamps.filter(ts => ts > cutoff);
                
                if (validTimestamps.length === 0) {
                    // No valid timestamps, remove this token
                    tokens.delete(denom);
                } else {
                    // Recalculate amount based on valid timestamps
                    const singleAmount = this.getSingleAmount(denom);
                    info.amount = singleAmount * BigInt(validTimestamps.length);
                    info.timestamps = validTimestamps;
                    hasValidTokens = true;
                }
            }
            
            if (!hasValidTokens) {
                this.allowances.delete(address);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(` Cleaned ${cleaned} old allowance entries`);
            this.saveData();
        }
    }
    
    /**
     * Get single faucet amount for a token
     */
    getSingleAmount(denom) {
        const tokens = this.config.blockchain?.tx?.amounts || [];
        const token = tokens.find(t => t.denom === denom);
        return BigInt(token?.amount || "0");
    }
    
    /**
     * Check if address can receive tokens
     * Returns { allowed: boolean, available: Map<denom, amount> }
     */
    async checkAllowance(address, requestedTokens) {
        const now = Date.now();
        const cutoff = now - (24 * 60 * 60 * 1000);
        
        // Get current allowance for this address
        const addressAllowance = this.allowances.get(address) || new Map();
        const available = new Map();
        let allowed = true;
        
        for (const [denom, requestedAmount] of requestedTokens.entries()) {
            const dailyLimit = this.dailyLimits.get(denom) || 0n;
            const tokenInfo = addressAllowance.get(denom) || { amount: 0n, timestamps: [] };
            
            // Filter valid timestamps
            const validTimestamps = tokenInfo.timestamps.filter(ts => ts > cutoff);
            const singleAmount = this.getSingleAmount(denom);
            const currentUsage = singleAmount * BigInt(validTimestamps.length);
            
            const remaining = dailyLimit - currentUsage;
            const canReceive = remaining >= BigInt(requestedAmount);
            
            if (!canReceive) {
                allowed = false;
            }
            
            available.set(denom, remaining > 0n ? remaining : 0n);
        }
        
        return { allowed, available };
    }
    
    /**
     * Update allowance after successful distribution
     */
    updateAllowance(address, distributedTokens) {
        const now = Date.now();
        
        if (!this.allowances.has(address)) {
            this.allowances.set(address, new Map());
        }
        
        const addressAllowance = this.allowances.get(address);
        
        for (const [denom, amount] of distributedTokens.entries()) {
            if (!addressAllowance.has(denom)) {
                addressAllowance.set(denom, { amount: 0n, timestamps: [] });
            }
            
            const tokenInfo = addressAllowance.get(denom);
            tokenInfo.timestamps.push(now);
            // We'll recalculate the amount on cleanup
        }
        
        // Save periodically
        if (Math.random() < 0.1) {
            this.saveData();
        }
    }
    
    /**
     * Get remaining time until allowance resets
     */
    getRemainingResetTime(address) {
        const addressAllowance = this.allowances.get(address);
        if (!addressAllowance || addressAllowance.size === 0) {
            return 0;
        }
        
        let oldestTimestamp = Infinity;
        for (const tokenInfo of addressAllowance.values()) {
            if (tokenInfo.timestamps.length > 0) {
                const minTs = Math.min(...tokenInfo.timestamps);
                oldestTimestamp = Math.min(oldestTimestamp, minTs);
            }
        }
        
        if (oldestTimestamp === Infinity) {
            return 0;
        }
        
        const resetTime = oldestTimestamp + (24 * 60 * 60 * 1000);
        return Math.max(0, resetTime - Date.now());
    }
    
    /**
     * Format remaining time as human-readable string
     */
    formatRemainingTime(ms) {
        const hours = Math.floor(ms / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}