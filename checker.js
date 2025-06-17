/**
 * FrequencyChecker - Rate limiting for faucet requests
 * Prevents abuse by tracking IP addresses and wallet addresses
 */

import fs from 'fs';
import path from 'path';

export class FrequencyChecker {
    constructor(config) {
        this.config = config;
        this.dbPath = config.db?.path || '.faucet/history.db';
        this.limits = {
            address: config.blockchain?.limit?.address || 1,
            ip: config.blockchain?.limit?.ip || 10
        };
        
        // In-memory storage with persistence
        this.requests = new Map();
        this.windowHours = 24;
        
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
     * Load persisted rate limiting data
     */
    loadData() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                const parsed = JSON.parse(data);
                this.requests = new Map(parsed.requests || []);
                console.log(` Loaded ${this.requests.size} rate limit entries`);
            }
        } catch (error) {
            console.warn('  Could not load rate limit data:', error.message);
            this.requests = new Map();
        }
    }
    
    /**
     * Save rate limiting data to disk
     */
    saveData() {
        try {
            const data = {
                requests: Array.from(this.requests.entries()),
                lastSaved: new Date().toISOString()
            };
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('  Could not save rate limit data:', error.message);
        }
    }
    
    /**
     * Clean up old entries outside the time window
     */
    cleanup() {
        const cutoff = Date.now() - (this.windowHours * 60 * 60 * 1000);
        let cleaned = 0;
        
        for (const [key, timestamps] of this.requests.entries()) {
            const validTimestamps = timestamps.filter(ts => ts > cutoff);
            if (validTimestamps.length === 0) {
                this.requests.delete(key);
                cleaned++;
            } else if (validTimestamps.length !== timestamps.length) {
                this.requests.set(key, validTimestamps);
            }
        }
        
        if (cleaned > 0) {
            console.log(` Cleaned ${cleaned} old rate limit entries`);
            this.saveData();
        }
    }
    
    /**
     * Check if an address can make a request
     */
    async checkAddress(address, type) {
        const key = `addr_${address}_${type}`;
        return this.checkLimit(key, this.limits.address, `address ${address}`);
    }
    
    /**
     * Check if an IP can make a request  
     */
    async checkIp(ip, type) {
        const key = `ip_${ip}_${type}`;
        return this.checkLimit(key, this.limits.ip, `IP ${ip}`);
    }
    
    /**
     * Check if a key is within rate limits
     */
    checkLimit(key, limit, description) {
        const now = Date.now();
        const cutoff = now - (this.windowHours * 60 * 60 * 1000);
        
        // Get valid timestamps within window
        const timestamps = this.requests.get(key) || [];
        const validTimestamps = timestamps.filter(ts => ts > cutoff);
        
        // Update stored timestamps
        this.requests.set(key, validTimestamps);
        
        const currentCount = validTimestamps.length;
        const allowed = currentCount < limit;
        
        if (!allowed) {
            console.log(` Rate limit exceeded for ${description}: ${currentCount}/${limit} in last ${this.windowHours}h`);
        } else {
            console.log(` Rate limit OK for ${description}: ${currentCount}/${limit} in last ${this.windowHours}h`);
        }
        
        return allowed;
    }
    
    /**
     * Update rate limiting data after successful request
     */
    update(key) {
        const now = Date.now();
        const timestamps = this.requests.get(key) || [];
        timestamps.push(now);
        this.requests.set(key, timestamps);
        
        // Save periodically (every 10th update to avoid excessive I/O)
        if (Math.random() < 0.1) {
            this.saveData();
        }
        
        console.log(` Updated rate limit for ${key}`);
    }
    
    /**
     * Get current statistics
     */
    getStats() {
        const now = Date.now();
        const cutoff = now - (this.windowHours * 60 * 60 * 1000);
        
        let activeEntries = 0;
        let totalRequests = 0;
        
        for (const timestamps of this.requests.values()) {
            const validTimestamps = timestamps.filter(ts => ts > cutoff);
            if (validTimestamps.length > 0) {
                activeEntries++;
                totalRequests += validTimestamps.length;
            }
        }
        
        return {
            activeEntries,
            totalRequests,
            windowHours: this.windowHours,
            limits: this.limits
        };
    }
}