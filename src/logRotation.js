/**
 * Log Rotation Utility
 * Manages log file sizes and rotation to prevent excessive disk usage
 */

import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

class LogRotation {
    constructor(options = {}) {
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
        this.maxFiles = options.maxFiles || 5; // Keep 5 rotated files
        this.checkInterval = options.checkInterval || 60 * 60 * 1000; // Check every hour
        this.logFiles = new Map();
        this.rotationIntervals = new Map();
    }

    /**
     * Register a log file for rotation monitoring
     */
    registerLogFile(logPath, options = {}) {
        const config = {
            path: logPath,
            maxSize: options.maxSize || this.maxFileSize,
            maxFiles: options.maxFiles || this.maxFiles,
            compress: options.compress || false
        };
        
        this.logFiles.set(logPath, config);
        
        // Start monitoring this file
        this.startMonitoring(logPath);
        
        console.log(`[LogRotation] Registered ${logPath} for rotation monitoring`);
    }

    /**
     * Start monitoring a log file
     */
    startMonitoring(logPath) {
        // Initial check
        this.checkAndRotate(logPath);
        
        // Set up periodic checks
        const interval = setInterval(() => {
            this.checkAndRotate(logPath);
        }, this.checkInterval);
        
        this.rotationIntervals.set(logPath, interval);
    }

    /**
     * Stop monitoring a log file
     */
    stopMonitoring(logPath) {
        const interval = this.rotationIntervals.get(logPath);
        if (interval) {
            clearInterval(interval);
            this.rotationIntervals.delete(logPath);
            this.logFiles.delete(logPath);
        }
    }

    /**
     * Check file size and rotate if necessary
     */
    async checkAndRotate(logPath) {
        const config = this.logFiles.get(logPath);
        if (!config) return;
        
        try {
            // Check if file exists
            if (!fs.existsSync(logPath)) {
                return;
            }
            
            const stats = fs.statSync(logPath);
            
            // Check if rotation is needed
            if (stats.size >= config.maxSize) {
                console.log(`[LogRotation] Rotating ${logPath} (size: ${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
                await this.rotateFile(logPath, config);
            }
        } catch (error) {
            console.error(`[LogRotation] Error checking ${logPath}:`, error.message);
        }
    }

    /**
     * Rotate a log file
     */
    async rotateFile(logPath, config) {
        try {
            const dir = path.dirname(logPath);
            const basename = path.basename(logPath);
            const ext = path.extname(basename);
            const name = basename.slice(0, -ext.length);
            
            // Shift existing rotated files
            for (let i = config.maxFiles - 1; i > 0; i--) {
                const oldPath = path.join(dir, `${name}.${i}${ext}`);
                const newPath = path.join(dir, `${name}.${i + 1}${ext}`);
                
                if (fs.existsSync(oldPath)) {
                    if (i === config.maxFiles - 1) {
                        // Delete the oldest file
                        fs.unlinkSync(oldPath);
                    } else {
                        // Rename to next number
                        fs.renameSync(oldPath, newPath);
                    }
                }
            }
            
            // Rotate current file to .1
            const rotatedPath = path.join(dir, `${name}.1${ext}`);
            fs.renameSync(logPath, rotatedPath);
            
            // Create new empty log file
            fs.writeFileSync(logPath, '');
            
            console.log(`[LogRotation] Rotated ${logPath} to ${rotatedPath}`);
            
            // Optional: compress rotated file
            if (config.compress) {
                await this.compressFile(rotatedPath);
            }
        } catch (error) {
            console.error(`[LogRotation] Error rotating ${logPath}:`, error.message);
        }
    }

    /**
     * Compress a rotated file (optional)
     */
    async compressFile(filePath) {
        try {
            const zlib = await import('zlib');
            const pipeline = await import('stream').then(m => m.pipeline);
            const promisify = await import('util').then(m => m.promisify);
            const pipelineAsync = promisify(pipeline);
            
            const gzipPath = `${filePath}.gz`;
            
            await pipelineAsync(
                fs.createReadStream(filePath),
                zlib.createGzip(),
                fs.createWriteStream(gzipPath)
            );
            
            // Remove original file after compression
            fs.unlinkSync(filePath);
            
            console.log(`[LogRotation] Compressed ${filePath} to ${gzipPath}`);
        } catch (error) {
            console.error(`[LogRotation] Error compressing ${filePath}:`, error.message);
        }
    }

    /**
     * Clean up old log files beyond retention
     */
    cleanupOldLogs(logPath, daysToKeep = 7) {
        try {
            const dir = path.dirname(logPath);
            const basename = path.basename(logPath);
            const ext = path.extname(basename);
            const name = basename.slice(0, -ext.length);
            
            const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
            
            // Find and delete old rotated files
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.startsWith(name) && file !== basename) {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime.getTime() < cutoffTime) {
                        fs.unlinkSync(filePath);
                        console.log(`[LogRotation] Deleted old log file: ${file}`);
                    }
                }
            });
        } catch (error) {
            console.error(`[LogRotation] Error cleaning up old logs:`, error.message);
        }
    }

    /**
     * Stop all monitoring
     */
    stopAll() {
        for (const [logPath, interval] of this.rotationIntervals.entries()) {
            clearInterval(interval);
        }
        this.rotationIntervals.clear();
        this.logFiles.clear();
        console.log('[LogRotation] Stopped all log rotation monitoring');
    }
}

// Export singleton instance
export default new LogRotation();

// Also export class for custom instances
export { LogRotation };