<template>
  <div>
    <!-- Token Information -->
    <div class="mb-4" v-if="config && config.tokens">
      <div class="row g-3">
        <div v-for="token in allTokens" :key="token.denom" class="col-md-6 col-lg-4">
          <div 
            class="token-card" 
            :class="[getTokenStatusClass(token), getHoverClass(token)]"
          >
            <div class="token-header">
              <div class="token-info">
                <div class="token-symbol">{{ getTokenSymbol(token) }}</div>
                <div class="token-name">{{ getTokenName(token) }}</div>
              </div>
              <span class="token-type-badge" :class="getTokenTypeBadgeClass(token)">
                {{ getTokenType(token) }}
              </span>
            </div>
            
            <div class="token-details">
              <div v-if="token.contract && token.contract !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'" class="token-address">
                <span 
                  class="address-text" 
                  @click="copyToClipboard(token.contract)"
                  :title="token.contract"
                >
                  {{ formatContractAddress(token.contract) }}
                </span>
                <i class="fas fa-copy copy-icon"></i>
              </div>
              <div v-else-if="token.denom && token.denom.startsWith('ibc/')" class="token-address">
                <span 
                  class="address-text" 
                  @click="copyToClipboard(token.denom)"
                  :title="token.denom"
                >
                  {{ formatIbcDenom(token.denom) }}
                </span>
                <i class="fas fa-copy copy-icon"></i>
              </div>
              
              <!-- Token Amount and Balance -->
              <div class="token-amounts">
                <div class="token-amount">
                  <strong>Claim: {{ formatClaimableAmount(token) }}</strong>
                </div>
                <div v-if="tokenBalances[token.denom]" class="token-balance">
                  <small class="text-muted">
                    Your Balance: {{ formatBalance(tokenBalances[token.denom].amount, tokenBalances[token.denom].decimals) }} 
                    {{ tokenBalances[token.denom].symbol || token.symbol }}
                  </small>
                </div>
              </div>
              
              <!-- Status Indicator -->
              <div class="token-status mt-2" v-if="address && isValid">
                <span v-if="getTokenStatus(token) === 'available'" class="status-text text-success">
                  <i class="fas fa-check-circle me-1"></i>Will receive
                </span>
                <span v-else-if="getTokenStatus(token) === 'maxed'" class="status-text text-warning">
                  <i class="fas fa-exclamation-circle me-1"></i>Already maxed
                </span>
                <span v-else-if="getTokenStatus(token) === 'incompatible'" class="status-text text-danger">
                  <i class="fas fa-times-circle me-1"></i>Not available for {{ addressType }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Help Tip (shown below tokens) -->
    <div class="help-tip mt-4" v-if="addressType === 'evm'">
      <div class="help-icon">
        <i class="fas fa-info-circle"></i>
      </div>
      <div class="help-content">
        <h6 class="mb-2">About WATOM</h6>
        <p class="mb-0">
          WATOM represents native ATOM on the EVM side. It's the same token that powers both Cosmos and EVM transactions,
          displayed with ATOM's standard 6 decimal precision. Whether you check your balance as "native" or "ERC20",
          you'll see the same ATOM amount.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useConfig } from '../composables/useConfig'

const props = defineProps({
  address: String,
  isValid: Boolean,
  hoveringWallet: String
})

const { config } = useConfig()
const tokenBalances = ref({})
const loadingBalances = ref(false)
const copiedAddress = ref('')

const addressType = computed(() => {
  if (!props.address) return ''
  return props.address.startsWith('cosmos') ? 'cosmos' : 'evm'
})

// Show appropriate tokens based on address type
const allTokens = computed(() => {
  if (!config.value || !config.value.tokens) return []
  
  let tokens = [...config.value.tokens]
  
  if (addressType.value === 'evm') {
    // For EVM addresses: hide native ATOM, show WATOM instead
    tokens = tokens.filter(t => t.denom !== 'uatom')
    
    // Find native ATOM token to create WATOM display
    const atomToken = config.value.tokens.find(t => t.denom === 'uatom')
    if (atomToken) {
      // Add WATOM as the EVM representation of ATOM
      tokens.push({
        ...atomToken,
        denom: 'watom',
        symbol: 'WATOM',
        name: 'Wrapped ATOM',
        type: 'wrapped',
        decimals: 6, // Using ATOM's native 6 decimals for cleaner display
        contract: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token placeholder
        description: 'Native ATOM on EVM (direct substitute for ETH)',
        isWrappedDisplay: true // Flag to indicate this is ATOM for EVM
      })
    }
  }
  
  return tokens
})

const getTokenStatus = (token) => {
  if (!props.address || !props.isValid) return 'neutral'
  
  // WATOM display token always shows the same status as ATOM
  if (token.isWrappedDisplay) {
    const atomToken = config.value.tokens.find(t => t.denom === 'uatom')
    if (atomToken) return getTokenStatus(atomToken)
  }
  
  // Check if token is compatible with address type
  const isCompatible = isTokenCompatible(token)
  if (!isCompatible) return 'incompatible'
  
  // Check if user already has max amount
  const balance = tokenBalances.value[token.denom]
  if (balance) {
    const currentAmount = parseFloat(balance.amount) || 0
    const targetAmount = parseFloat(token.target_balance || token.amount || 0)
    if (currentAmount >= targetAmount) return 'maxed'
  }
  
  return 'available'
}

const isTokenCompatible = (token) => {
  if (!addressType.value) return true
  
  if (addressType.value === 'cosmos') {
    // Cosmos addresses can only receive native tokens (not ERC20)
    // Native tokens are identified by not having an ERC20 contract or having special placeholder addresses
    return !token.contract || 
           token.contract === '0x0000000000000000000000000000000000000000' ||
           token.contract === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  } else if (addressType.value === 'evm') {
    // EVM addresses can receive all tokens
    // Native tokens (including IBC) are sent as native, ATOM is converted to WATOM
    return true
  }
  
  return false
}

const getTokenStatusClass = (token) => {
  const status = getTokenStatus(token)
  const claimPercentage = getClaimPercentage(token)
  
  return {
    'status-available': status === 'available' && claimPercentage >= 50,
    'status-partial': status === 'available' && claimPercentage < 50,
    'status-maxed': status === 'maxed',
    'status-incompatible': status === 'incompatible',
    'status-neutral': status === 'neutral' || !props.address
  }
}

const isNativeToken = (token) => {
  return token.denom === 'uatom' && (!token.contract || token.contract === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')
}

const getTokenSymbol = (token) => {
  // Always show the token's actual symbol
  // The WATOM conversion happens on the backend for EVM addresses
  return token.symbol || token.denom
}

const getTokenName = (token) => {
  // Show actual token name - backend handles WATOM conversion
  return token.name || ''
}

const getTokenType = (token) => {
  if (token.type === 'wrapped') return 'Wrapped'
  if (token.type === 'ibc') return 'IBC'
  if (token.type === 'erc20') return 'ERC20'
  if (token.denom === 'uatom') return 'Native'
  if (token.type === 'native') return 'Native'
  return token.type || 'Unknown'
}

const getTokenTypeBadgeClass = (token) => {
  const type = getTokenType(token)
  if (type === 'Native') return 'badge-native'
  if (type === 'Wrapped') return 'badge-wrapped'
  if (type === 'ERC20') return 'badge-erc20'
  if (type === 'IBC') return 'badge-ibc'
  return 'badge-default'
}

const formatContractAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const formatIbcDenom = (denom) => {
  if (!denom) return ''
  const parts = denom.split('/')
  if (parts.length === 2 && parts[1].length > 8) {
    return `${parts[0]}/...${parts[1].slice(-4)}`
  }
  return denom
}

const formatTokenAmount = (token) => {
  const amount = token.target_balance || token.amount || 0
  const formatted = formatBalance(amount, token.decimals || 0)
  const symbol = getTokenSymbol(token)
  return `${formatted} ${symbol}`
}

const getClaimPercentage = (token) => {
  const claimable = getClaimableAmountRaw(token)
  const target = parseFloat(token.target_balance || token.amount || 0)
  if (!target) return 0
  return (claimable / target) * 100
}

const getClaimableAmountRaw = (token) => {
  const target = parseFloat(token.target_balance || token.amount || 0)
  const balance = tokenBalances.value[token.denom]
  
  if (!balance) return target
  
  const current = parseFloat(balance.amount) || 0
  const remaining = target - current
  
  return Math.max(0, remaining)
}

const formatClaimableAmount = (token) => {
  const claimable = getClaimableAmountRaw(token)
  const formatted = formatBalance(claimable, token.decimals || 0)
  const symbol = getTokenSymbol(token)
  return `${formatted} ${symbol}`
}

const getHoverClass = (token) => {
  if (!props.hoveringWallet) return ''
  
  // Check if this token would be eligible for the hovering wallet
  const hoveringAddressType = props.hoveringWallet.startsWith('cosmos') ? 'cosmos' : 'evm'
  
  // Check compatibility
  if (hoveringAddressType === 'cosmos') {
    // Cosmos addresses can only receive native tokens
    const isCompatible = !token.contract || 
                        token.contract === '0x0000000000000000000000000000000000000000' ||
                        token.contract === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    return isCompatible ? 'token-hover-eligible' : ''
  } else if (hoveringAddressType === 'evm') {
    // EVM addresses can receive all tokens
    return 'token-hover-eligible'
  }
  
  return ''
}

const formatBalance = (amount, decimals = 0) => {
  if (!amount) return '0'
  
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
  try {
    await navigator.clipboard.writeText(text)
    copiedAddress.value = text
    setTimeout(() => {
      copiedAddress.value = ''
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

const fetchBalances = async () => {
  if (!props.address || !props.isValid || !addressType.value) return
  
  loadingBalances.value = true
  tokenBalances.value = {}
  
  try {
    const response = await fetch(`/balance/${addressType.value}?address=${props.address}`)
    const data = await response.json()
    
    if (data.balances) {
      // Create a map of balances by denom
      data.balances.forEach(balance => {
        tokenBalances.value[balance.denom] = balance
      })
    }
  } catch (error) {
    console.error('Error fetching balances:', error)
  } finally {
    loadingBalances.value = false
  }
}

// Watch for address changes
watch(() => props.address, () => {
  if (props.address && props.isValid) {
    fetchBalances()
  } else {
    tokenBalances.value = {}
  }
})

// Fetch balances on mount if address is already provided
onMounted(() => {
  if (props.address && props.isValid) {
    fetchBalances()
  }
})
</script>

<style scoped>
.help-tip {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--cosmos-accent);
  border-radius: 8px;
  align-items: flex-start;
}

.help-icon {
  color: var(--cosmos-accent);
  font-size: 1.5rem;
  flex-shrink: 0;
}

.help-content h6 {
  color: var(--cosmos-accent);
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.help-content p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.5;
}

.help-content ul {
  color: var(--text-secondary);
  font-size: 0.9rem;
  padding-left: 1.5rem;
}

.help-content li {
  margin-bottom: 0.25rem;
}

.token-card {
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 1rem;
  height: 100%;
  transition: all 0.2s ease;
  position: relative;
}

.token-card.status-available {
  border-color: #28a745;
}

.token-card.status-partial {
  border-color: #ff9800;
}

.token-card.status-maxed {
  border-color: #ffc107;
}

.token-card.status-incompatible {
  border-color: #dc3545;
}

.token-card.status-neutral {
  border-color: var(--border-color);
}

.token-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 210, 255, 0.1);
}

.token-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.token-info {
  flex: 1;
}

.token-symbol {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--cosmos-accent);
  margin-bottom: 0.25rem;
}

.token-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.token-type-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.badge-native {
  background: rgba(80, 100, 251, 0.1);
  color: var(--cosmos-secondary);
}

.badge-wrapped {
  background: rgba(128, 100, 251, 0.1);
  color: var(--cosmos-secondary);
}

.badge-erc20 {
  background: rgba(0, 210, 255, 0.1);
  color: var(--cosmos-accent);
}

.badge-ibc {
  background: rgba(46, 46, 84, 0.1);
  color: var(--cosmos-primary);
}

.badge-default {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.token-details {
  margin-top: 0.75rem;
}

.token-address {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-family: monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.address-text {
  cursor: pointer;
  transition: color 0.2s ease;
}

.address-text:hover {
  color: var(--cosmos-accent);
}

.copy-icon {
  font-size: 0.75rem;
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.token-address:hover .copy-icon {
  opacity: 1;
}

.token-amounts {
  margin-top: 0.5rem;
}

.token-amount {
  font-size: 0.95rem;
  color: var(--text-primary);
}

.token-balance {
  margin-top: 0.25rem;
}

.token-status {
  font-size: 0.85rem;
}

.status-text {
  font-weight: 500;
}

.text-success {
  color: #28a745;
}

.text-warning {
  color: #ffc107;
}

.text-danger {
  color: #dc3545;
}

/* Hover effect when hovering wallet in dropdown */
.token-card.token-hover-eligible {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 6px 20px rgba(0, 255, 136, 0.3);
  border-color: #00ff88;
  z-index: 10;
}
</style>