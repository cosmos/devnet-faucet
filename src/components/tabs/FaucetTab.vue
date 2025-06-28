<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0"><i class="fas fa-faucet me-2"></i>Request Tokens</h5>
      </div>
      <div class="card-body">
        <p class="text-muted mb-3">
          Enter your wallet address to receive test tokens or connect your wallet.
        </p>
        
        <!-- Wallet Connection Section -->
        <div class="mb-4">
          <div class="row">
            <!-- Cosmos Wallet (Keplr) -->
            <div class="col-md-6 mb-2">
              <div class="d-flex gap-2">
                <button 
                  type="button" 
                  class="wallet-btn flex-grow-1" 
                  :class="{ 'connected': cosmosWallet.connected }"
                  @click="cosmosWallet.connected ? disconnectKeplr() : connectKeplr(config?.network)"
                  :disabled="cosmosWallet.connecting || !config"
                >
                  <span v-if="cosmosWallet.connecting" class="loading-spinner me-2"></span>
                  <i v-else class="fas fa-atom me-2"></i>
                  <span v-if="cosmosWallet.connected">
                    Connected: {{ formatAddress(cosmosWallet.address) }}
                  </span>
                  <span v-else-if="cosmosWallet.connecting">
                    Connecting to Keplr...
                  </span>
                  <span v-else>
                    Connect Keplr Wallet
                  </span>
                </button>
              </div>
              <!-- Show full address when connected -->
              <div v-if="cosmosWallet.connected && cosmosWallet.address" class="mt-1">
                <small class="text-muted d-flex align-items-center gap-2">
                  <span class="font-monospace">{{ cosmosWallet.address }}</span>
                  <i 
                    class="fas fa-copy copy-icon-small" 
                    @click="copyToClipboard(cosmosWallet.address)"
                    title="Copy address"
                  ></i>
                </small>
              </div>
            </div>
            
            <!-- EVM Wallet (Reown AppKit) -->
            <div class="col-md-6 mb-2">
              <div class="d-flex gap-2">
                <button 
                  type="button" 
                  class="wallet-btn flex-grow-1" 
                  :class="{ 'connected': evmWallet.connected }"
                  @click="evmWallet.connected ? handleEvmDisconnect() : openModal()"
                  :disabled="evmWallet.connecting"
                >
                  <span v-if="evmWallet.connecting" class="loading-spinner me-2"></span>
                  <i v-else class="fas fa-wallet me-2"></i>
                  <span v-if="evmWallet.connected">
                    Connected: {{ formatAddress(evmWallet.address) }}
                  </span>
                  <span v-else-if="evmWallet.connecting">
                    Connecting...
                  </span>
                  <span v-else>
                    Connect EVM Wallet
                  </span>
                </button>
              </div>
              <!-- Show full address when connected -->
              <div v-if="evmWallet.connected && evmWallet.address" class="mt-1">
                <small class="text-muted d-flex align-items-center gap-2">
                  <span class="font-monospace">{{ evmWallet.address }}</span>
                  <i 
                    class="fas fa-copy copy-icon-small" 
                    @click="copyToClipboard(evmWallet.address)"
                    title="Copy address"
                  ></i>
                </small>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Address Input -->
        <div class="mb-3">
          <label class="form-label text-muted">Wallet Address</label>
          <div class="input-group">
            <input 
              type="text" 
              class="form-control" 
              v-model="address"
              placeholder="cosmos... or 0x..."
              :class="{ 
                'is-valid': address && isValidAddress, 
                'is-invalid': address && !isValidAddress 
              }"
            >
            <!-- Connected Wallet Quick Select -->
            <div v-if="hasConnectedWallets" class="input-group-text p-0">
              <div class="dropdown">
                <button 
                  class="btn btn-sm btn-link dropdown-toggle text-decoration-none" 
                  type="button" 
                  data-bs-toggle="dropdown" 
                  aria-expanded="false"
                  title="Use connected wallet address"
                >
                  <i class="fas fa-wallet me-1"></i>
                  Use Wallet
                </button>
                <ul class="dropdown-menu dropdown-menu-end">
                  <li v-if="cosmosWallet.connected">
                    <a class="dropdown-item" href="#" @click.prevent="useCosmosAddress">
                      <i class="fas fa-atom me-2"></i>
                      <span class="text-truncate">{{ formatAddress(cosmosWallet.address) }}</span>
                      <small class="text-muted ms-1">(Cosmos)</small>
                    </a>
                  </li>
                  <li v-if="evmWallet.connected">
                    <a class="dropdown-item" href="#" @click.prevent="useEvmAddress">
                      <i class="fab fa-ethereum me-2"></i>
                      <span class="text-truncate">{{ formatAddress(evmWallet.address) }}</span>
                      <small class="text-muted ms-1">(EVM)</small>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <small v-if="isValidAddress" class="text-success">
            <i class="fas fa-check-circle me-1"></i>
            Valid {{ addressType }} address
            <span v-if="addressMatchesWallet" class="ms-1">
              <i class="fas fa-link"></i>
              ({{ connectedWalletType }})
            </span>
          </small>
          <small v-else-if="address" class="text-danger">
            <i class="fas fa-exclamation-circle me-1"></i>
            Invalid address format
          </small>
        </div>
        
        <!-- Submit Button -->
        <button 
          class="btn btn-primary w-100"
          @click="requestToken"
          :disabled="!isValidAddress || isLoading"
        >
          <span v-if="isLoading">
            <span class="loading-spinner me-2"></span>
            Processing...
          </span>
          <span v-else>
            <i class="fas fa-faucet me-2"></i>
            Request Tokens
          </span>
        </button>
        
        <!-- Messages -->
        <div v-if="message" class="mt-3" v-html="message"></div>
        
        <!-- Balances -->
        <FaucetBalances :address="address" :is-valid="isValidAddress" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useWalletStore } from '../../composables/useWalletStore'
import { useConfig } from '../../composables/useConfig'
import { useTransactions } from '../../composables/useTransactions'
import FaucetBalances from '../FaucetBalances.vue'

const { cosmosWallet, evmWallet, connectKeplr, disconnectKeplr, disconnectEvm } = useWalletStore()
const { networkConfig, config } = useConfig()
const { addTransactionToHistory } = useTransactions()

// Inject the AppKit modal
const modal = inject('appKitModal')
const openAppKitModal = inject('openAppKitModal')
const disconnectAppKit = inject('disconnectAppKit')

const address = ref('')
const message = ref('')
const isLoading = ref(false)

const isValidAddress = computed(() => {
  if (!address.value) return false
  return address.value.startsWith('cosmos') || 
         (address.value.startsWith('0x') && address.value.length === 42)
})

const addressType = computed(() => {
  if (!address.value) return ''
  return address.value.startsWith('cosmos') ? 'Cosmos' : 'EVM'
})

const hasConnectedWallets = computed(() => {
  return cosmosWallet.connected || evmWallet.connected
})

const addressMatchesWallet = computed(() => {
  if (!address.value) return false
  return (cosmosWallet.connected && address.value === cosmosWallet.address) ||
         (evmWallet.connected && address.value === evmWallet.address)
})

const connectedWalletType = computed(() => {
  if (cosmosWallet.connected && address.value === cosmosWallet.address) return 'Keplr'
  if (evmWallet.connected && address.value === evmWallet.address) return 'EVM Wallet'
  return ''
})

const formatAddress = (addr) => {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

const useCosmosAddress = () => {
  if (cosmosWallet.connected && cosmosWallet.address) {
    address.value = cosmosWallet.address
  }
}

const useEvmAddress = () => {
  if (evmWallet.connected && evmWallet.address) {
    address.value = evmWallet.address
  }
}

const openModal = () => {
  console.log('openModal called, openAppKitModal exists:', !!openAppKitModal)
  if (openAppKitModal) {
    try {
      // Check for wallet conflicts before opening
      if (window.ethereum && window.ethereum.providers && window.ethereum.providers.length > 1) {
        console.warn('Multiple wallet providers detected:', window.ethereum.providers.length)
        // Still try to open - the user can select their preferred wallet
      }
      console.log('Calling openAppKitModal...')
      openAppKitModal()
    } catch (error) {
      console.error('Error opening modal:', error)
      // Provide more helpful error message
      if (error.message && error.message.includes('providers')) {
        alert('Multiple wallet extensions detected. Please disable all but one wallet extension and try again.')
      } else {
        alert('Failed to open wallet connection dialog. Please refresh the page and try again.')
      }
    }
  } else {
    alert('Wallet connection is initializing. Please try again in a moment.')
  }
}

const handleEvmDisconnect = async () => {
  if (disconnectAppKit) {
    await disconnectAppKit()
  }
  disconnectEvm()
}

const requestToken = async () => {
  if (!isValidAddress.value) {
    message.value = `
      <div class="alert alert-warning">
        <h6><i class="fas fa-exclamation-circle me-2"></i>Invalid Address</h6>
        <p class="mb-0">Please enter a valid Cosmos (cosmos...) or EVM (0x...) address</p>
      </div>`
    return
  }

  message.value = `
    <div class="alert alert-info">
      <h6><i class="fas fa-clock me-2"></i>Processing Transaction</h6>
      <div class="d-flex align-items-center">
        <div class="loading-spinner me-2"></div>
        <span>Sending tokens to ${addressType.value} address...</span>
      </div>
    </div>`

  isLoading.value = true
  
  try {
    const response = await fetch(`/send/${address.value}`)
    const data = await response.json()
    
    const isSuccess = data.result && (data.result.code === 0 || data.result.transactions)
    
    let txHash = null
    if (isSuccess && data.result) {
      txHash = data.result.transaction_hash || 
               data.result.hash || 
               (data.result.transactions && data.result.transactions[0]) || 
               null
    }
    
    addTransactionToHistory({
      address: address.value,
      addressType: addressType.value,
      success: isSuccess,
      data: data,
      hash: txHash,
      timestamp: new Date()
    })
    
    const explorerUrl = data.result?.explorer_url
    const noTokensNeeded = data.result?.status === 'no_tokens_sent' || 
                         (data.result?.tokens_sent && data.result.tokens_sent.length === 0)
    
    if (noTokensNeeded) {
      let tokenList = ''
      if (data.result?.token_status || data.result?.tokens_not_sent) {
        const tokenData = data.result.token_status || data.result.tokens_not_sent
        const tokenNames = tokenData.map(t => t.symbol).join(', ')
        tokenList = tokenNames
      }
      
      message.value = `
        <div class="alert alert-warning alert-dismissible show fade" role="alert">
            <h6 class="alert-heading">
              <i class="fas fa-info-circle me-2"></i>
              No Tokens Sent
            </h6>
            <p class="mb-0"><strong>This wallet already holds the maximum amount of ${tokenList} the faucet allows.</strong></p>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
      `
    } else {
      const hasSentTokens = data.result?.tokens_sent && data.result.tokens_sent.length > 0
      const hasNotSentTokens = data.result?.tokens_not_sent && data.result.tokens_not_sent.length > 0
      const isPartialSuccess = isSuccess && hasSentTokens && hasNotSentTokens
      
      if (isPartialSuccess) {
        let sentTokensList = data.result.tokens_sent.map(token => {
          let amount = formatBalance(token.amount, token.decimals)
          return `${amount} ${token.symbol}`
        }).join(', ')
        
        let notSentTokensList = data.result.tokens_not_sent.map(t => t.symbol).join(', ')
        
        message.value = `
          <div class="alert alert-success alert-dismissible show fade mb-2" role="alert">
              <h6 class="alert-heading">
                <i class="fas fa-check-circle me-2"></i>
                Tokens Sent Successfully!
              </h6>
              <p class="mb-2"><strong>Sent:</strong> ${sentTokensList}</p>
              ${txHash ? `<p class="mb-2"><strong>Transaction:</strong> <code class="small">${txHash}</code></p>` : ''}
              ${explorerUrl ? `<p class="mb-0"><a href="${explorerUrl}" target="_blank" class="btn btn-outline-primary btn-sm"><i class="fas fa-external-link-alt me-1"></i>View on Explorer</a></p>` : ''}
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          </div>
          <div class="alert alert-warning alert-dismissible show fade" role="alert">
              <h6 class="alert-heading">
                <i class="fas fa-info-circle me-2"></i>
                Some Tokens Not Sent
              </h6>
              <p class="mb-0"><strong>This wallet already holds the maximum amount of ${notSentTokensList} the faucet allows.</strong></p>
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          </div>
        `
      } else {
        let tokenSummaryHtml = ''
        if (hasSentTokens) {
          let sentTokensList = data.result.tokens_sent.map(token => {
            let amount = formatBalance(token.amount, token.decimals)
            return `${amount} ${token.symbol}`
          }).join(', ')
          tokenSummaryHtml = `<p class="mb-2"><strong>Sent:</strong> ${sentTokensList}</p>`
        }
        
        message.value = `
          <div class="alert alert-${isSuccess ? 'success' : 'danger'} alert-dismissible show fade" role="alert">
              <h6 class="alert-heading">
                <i class="fas fa-${isSuccess ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
                ${isSuccess ? 'Tokens Sent Successfully!' : 'Request Failed'}
              </h6>
              ${tokenSummaryHtml}
              ${txHash ? `<p class="mb-2"><strong>Transaction:</strong> <code class="small">${txHash}</code></p>` : ''}
              ${explorerUrl ? `<p class="mb-2"><a href="${explorerUrl}" target="_blank" class="btn btn-outline-primary btn-sm"><i class="fas fa-external-link-alt me-1"></i>View on Explorer</a></p>` : ''}
              <p class="mb-0 small text-muted">Full transaction details saved to Recent Txs tab.</p>
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
          </div>
        `
      }
    }
  } catch (err) {
    addTransactionToHistory({
      address: address.value,
      addressType: addressType.value,
      success: false,
      data: { 
        error: err.message,
        result: {
          message: err.message,
          network_type: addressType.value.toLowerCase()
        }
      },
      hash: null,
      timestamp: new Date()
    })
    
    message.value = `
      <div class="alert alert-danger alert-dismissible show fade" role="alert">
        <h6 class="alert-heading">
          <i class="fas fa-exclamation-triangle me-2"></i>Network Error
        </h6>
        <p class="mb-0">${err.message}</p>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>`
  } finally {
    isLoading.value = false
  }
}

const formatBalance = (amount, decimals = 0) => {
  if (!amount) return '0'
  let amountStr = amount.toString()
  if (amountStr.includes('e+') || amountStr.includes('e-')) {
    amountStr = Number(amount).toLocaleString('fullwide', {useGrouping: false})
  }
  const num = BigInt(amountStr)
  if (decimals > 0) {
    const divisor = BigInt(10 ** decimals)
    const whole = num / divisor
    const fraction = num % divisor
    if (fraction === 0n) {
      return whole.toString()
    } else {
      const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
      return `${whole.toString()}.${fractionStr}`
    }
  }
  return num.toLocaleString()
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    // Could add a toast notification here
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<style scoped>
.wallet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.95rem;
  transition: all 0.2s ease;
  min-height: 46px;
}

.wallet-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--cosmos-accent);
  color: var(--cosmos-accent);
  transform: translateY(-1px);
}

.wallet-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.wallet-btn.connected {
  background: var(--bg-secondary);
  border-color: #28a745;
  color: #28a745;
}

.wallet-btn.connected:hover {
  border-color: var(--cosmos-accent);
  color: var(--cosmos-accent);
}

.copy-icon-small {
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s ease;
  font-size: 0.875rem;
}

.copy-icon-small:hover {
  opacity: 1;
  color: var(--cosmos-accent);
}

.font-monospace {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
}

/* Input group improvements */
.input-group-text {
  background: transparent;
  border-left: none;
}

.dropdown-toggle {
  color: var(--cosmos-accent) !important;
  font-size: 0.9rem;
  padding: 0.375rem 0.75rem;
}

.dropdown-toggle:hover {
  background: var(--bg-secondary);
  border-radius: 0 0.375rem 0.375rem 0;
}

.dropdown-menu {
  min-width: 200px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.dropdown-item {
  color: var(--text-primary);
  padding: 0.5rem 1rem;
  transition: all 0.2s ease;
}

.dropdown-item:hover {
  background: var(--bg-secondary);
  color: var(--cosmos-accent);
}

.dropdown-item i {
  width: 20px;
  text-align: center;
}
</style>