export class FrequencyChecker {
  constructor(config) {
    const limits = (config && config.blockchain && config.blockchain.limit) || { address: 1, ip: 10 };
    this.addressLimit = limits.address || 1;
    this.ipLimit = limits.ip || 10;

    // 24-hour window
    this.windowMs = 24 * 60 * 60 * 1000;

    // Maps of key => [ timestamps ]
    this.records = new Map();
  }

  _purgeOld(key) {
    const now = Date.now();
    const list = this.records.get(key) || [];
    const filtered = list.filter((ts) => now - ts < this.windowMs);
    if (filtered.length === 0) {
      this.records.delete(key);
    } else {
      this.records.set(key, filtered);
    }
    return filtered;
  }

  checkAddress(address, _mode = 'dual') {
    const list = this._purgeOld(address);
    return list.length < this.addressLimit;
  }

  checkIp(ip, _mode = 'dual') {
    const list = this._purgeOld(ip);
    return list.length < this.ipLimit;
  }

  update(key) {
    const list = this.records.get(key) || [];
    list.push(Date.now());
    this.records.set(key, list);
  }
}