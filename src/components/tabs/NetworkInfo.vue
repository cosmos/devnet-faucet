<template>
  <div>
    <!-- Network Details -->
    <div class="info-card">
      <h5 class="info-title">
        <i class="fas fa-network-wired"></i>
        Network Details
      </h5>
      
      <!-- Nested Tab Navigation -->
      <ul class="nav nav-pills mb-3" role="tablist">
        <li class="nav-item" role="presentation">
          <button 
            class="nav-link"
            :class="{ active: activeNetworkTab === 'cosmos' }"
            @click="activeNetworkTab = 'cosmos'"
            type="button"
            role="tab"
          >
            <i class="fas fa-atom me-2"></i>Cosmos
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button 
            class="nav-link"
            :class="{ active: activeNetworkTab === 'evm' }"
            @click="activeNetworkTab = 'evm'"
            type="button"
            role="tab"
          >
            <i class="fab fa-ethereum me-2"></i>EVM
          </button>
        </li>
      </ul>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- Cosmos Section -->
        <div v-if="activeNetworkTab === 'cosmos'" class="network-section">
          <div class="info-item">
            <span class="info-label">Chain ID:</span>
            <code class="info-value">{{ networkConfig.cosmos?.chainId || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">RPC:</span>
            <code class="info-value text-truncate">{{ networkConfig.cosmos?.rpc || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">gRPC:</span>
            <code class="info-value text-truncate">{{ networkConfig.cosmos?.grpc || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">REST:</span>
            <code class="info-value text-truncate">{{ networkConfig.cosmos?.rest || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">Faucet Wallet:</span>
            <code class="info-value address-value" @click="copyToClipboard(networkConfig.faucetAddresses?.cosmos)">
              {{ networkConfig.faucetAddresses?.cosmos || 'Loading...' }}
              <i class="fas fa-copy copy-icon"></i>
            </code>
          </div>
          
          <!-- IBC Tokens (show only in Cosmos tab) -->
          <div v-if="ibcTokens.length > 0" class="ibc-section mt-4">
            <h6 class="section-subtitle">
              <i class="fas fa-link"></i>
              IBC Tokens
              <button class="btn btn-sm btn-outline-primary ms-2" @click="refreshIBCBalances" :disabled="loadingIBC">
                <i class="fas" :class="loadingIBC ? 'fa-spinner fa-spin' : 'fa-sync'"></i>
              </button>
            </h6>
            <div class="ibc-token-item" v-for="token in ibcTokens" :key="token.denom">
              <div class="ibc-token-header">
                <span class="token-name">{{ token.symbol || token.name }}</span>
                <span class="token-balance">{{ formatBalance(token.amount, token.decimals) }}</span>
              </div>
              <div class="ibc-denom" @click="copyToClipboard(token.denom)">
                <code>{{ formatIBCDenom(token.denom) }}</code>
                <i class="fas fa-copy copy-icon"></i>
              </div>
            </div>
          </div>
        </div>

        <!-- EVM Section -->
        <div v-if="activeNetworkTab === 'evm'" class="network-section">
          <div class="info-item">
            <span class="info-label">Chain ID:</span>
            <code class="info-value">{{ networkConfig.evm?.chainId || 'Loading...' }} ({{ networkConfig.evm?.chainIdHex || '0x...' }})</code>
          </div>
          <div class="info-item">
            <span class="info-label">RPC:</span>
            <code class="info-value text-truncate">{{ networkConfig.evm?.rpc || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">WebSocket:</span>
            <code class="info-value text-truncate">{{ networkConfig.evm?.websocket || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">Explorer:</span>
            <code class="info-value text-truncate">{{ networkConfig.evm?.explorer || 'Loading...' }}</code>
          </div>
          <div class="info-item">
            <span class="info-label">Faucet Wallet:</span>
            <code class="info-value address-value" @click="copyToClipboard(networkConfig.faucetAddresses?.evm)">
              {{ networkConfig.faucetAddresses?.evm || 'Loading...' }}
              <i class="fas fa-copy copy-icon"></i>
            </code>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useConfig } from '../../composables/useConfig'

const { networkConfig, config } = useConfig()
const ibcTokens = ref([])
const loadingIBC = ref(false)
const copiedText = ref('')
const activeNetworkTab = ref('cosmos')

const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const formatIBCDenom = (denom) => {
  if (!denom) return ''
  const parts = denom.split('/')
  if (parts.length === 2 && parts[1].length > 8) {
    return `${parts[0]}/...${parts[1].slice(-6)}`
  }
  return denom
}

const formatBalance = (amount, decimals = 0) => {
  if (!amount || amount === '0') return '0'
  
  try {
    const divisor = Math.pow(10, decimals)
    const value = parseFloat(amount) / divisor
    
    if (value === 0) return '0'
    if (value < 0.000001) return value.toExponential(2)
    if (value < 1) return value.toFixed(6).replace(/\.?0+$/, '')
    if (value < 1000) return value.toFixed(2).replace(/\.?0+$/, '')
    
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  } catch (error) {
    console.error('Error formatting balance:', error)
    return '0'
  }
}

const copyToClipboard = async (text) => {
  if (!text) return
  
  try {
    await navigator.clipboard.writeText(text)
    copiedText.value = text
    setTimeout(() => {
      copiedText.value = ''
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const fetchIBCBalances = async () => {
  if (!networkConfig.value.faucetAddresses?.cosmos || !config.value) return
  
  loadingIBC.value = true
  try {
    const restEndpoint = config.value.blockchain.endpoints.rest_endpoint
    const cosmosAddress = networkConfig.value.faucetAddresses.cosmos
    
    const response = await fetch(`${restEndpoint}/cosmos/bank/v1beta1/balances/${cosmosAddress}`)
    const data = await response.json()
    
    if (data.balances && Array.isArray(data.balances)) {
      // Filter for IBC tokens
      const ibcBalances = data.balances.filter(b => b.denom.startsWith('ibc/'))
      
      // Try to match with known IBC tokens from config
      const tokens = config.value.blockchain.tx.amounts || []
      
      ibcTokens.value = ibcBalances.map(balance => {
        // Find matching token config
        const tokenConfig = tokens.find(t => t.denom === balance.denom)
        
        return {
          denom: balance.denom,
          amount: balance.amount,
          symbol: tokenConfig?.symbol || 'Unknown',
          name: tokenConfig?.name || 'IBC Token',
          decimals: tokenConfig?.decimals || 6
        }
      })
    }
  } catch (error) {
    console.error('Error fetching IBC balances:', error)
  } finally {
    loadingIBC.value = false
  }
}

const refreshIBCBalances = () => {
  fetchIBCBalances()
}

onMounted(() => {
  fetchIBCBalances()
})
</script>

<style scoped>
/* Tab Navigation Styles */
.nav-pills {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0;
}

.nav-pills .nav-link {
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px 8px 0 0;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  border-bottom: 2px solid transparent;
}

.nav-pills .nav-link:hover {
  color: var(--cosmos-accent);
  background: var(--bg-secondary);
}

.nav-pills .nav-link.active {
  color: var(--cosmos-accent);
  background: var(--bg-secondary);
  border-bottom-color: var(--cosmos-accent);
}

.tab-content {
  padding-top: 1rem;
}

@media (max-width: 768px) {
  .nav-pills {
    margin-bottom: 1rem;
  }
  
  .nav-pills .nav-link {
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
  }
  
  .info-card {
    padding: 1rem;
  }
  
  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  
  .info-label {
    min-width: auto;
    font-size: 0.85rem;
  }
  
  .info-value {
    font-size: 0.8rem;
    width: 100%;
  }
  
  /* Allow text wrapping on mobile */
  .text-truncate {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
  }
  
  .address-value {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
  }
  
  .section-subtitle {
    font-size: 0.9rem;
  }
}

.info-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
}

.info-title {
  color: var(--cosmos-accent);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.info-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
  min-width: 120px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  word-break: break-word;
  flex: 1;
  min-width: 0;
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: block;
}

.address-value {
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.address-value:hover {
  color: var(--cosmos-accent);
}

.copy-icon {
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.address-value:hover .copy-icon {
  opacity: 0.7;
}


.section-subtitle {
  color: var(--cosmos-accent);
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
}

.ibc-section {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.network-section {
  padding: 0;
}

/* IBC Token Styles */
.ibc-token-item {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.ibc-token-item:last-child {
  margin-bottom: 0;
}

.ibc-token-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.token-name {
  font-weight: 600;
  color: var(--text-primary);
}

.token-balance {
  color: var(--cosmos-accent);
  font-weight: 500;
}

.ibc-denom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.ibc-denom:hover {
  color: var(--cosmos-accent);
}

.ibc-denom code {
  font-size: 0.8rem;
  background: none;
  padding: 0;
}

.ibc-denom .copy-icon {
  font-size: 0.7rem;
}
</style>