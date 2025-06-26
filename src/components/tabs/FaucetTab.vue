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
                  class="btn flex-grow-1" 
                  :class="cosmosWallet.connected ? 'btn-success' : 'btn-outline-primary'"
                  @click="cosmosWallet.connected ? disconnectKeplr() : connectKeplr()"
                  :disabled="cosmosWallet.connecting"
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
                <button 
                  v-if="cosmosWallet.connected"
                  type="button" 
                  class="btn btn-primary"
                  @click="useCosmosAddress()"
                  title="Use this address"
                >
                  <i class="fas fa-arrow-down"></i>
                </button>
              </div>
            </div>
            
            <!-- EVM Wallet (Reown AppKit) -->
            <div class="col-md-6 mb-2">
              <div class="d-flex gap-2">
                <appkit-button />
                <button 
                  v-if="evmWallet.connected"
                  type="button" 
                  class="btn btn-primary"
                  @click="useEvmAddress()"
                  title="Use this address"
                >
                  <i class="fas fa-arrow-down"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Address Input -->
        <div class="mb-3">
          <label class="form-label text-muted">Wallet Address</label>
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
          <small v-if="isValidAddress" class="text-success">
            <i class="fas fa-check-circle me-1"></i>
            Valid {{ addressType }} address
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

const { cosmosWallet, evmWallet, connectKeplr, disconnectKeplr } = useWalletStore()
const { networkConfig } = useConfig()
const { addTransactionToHistory } = useTransactions()

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
      data: { error: err.message },
      hash: null,
      timestamp: new Date()
    })
    
    message.value = `
      <div class="alert alert-danger">
        <h6><i class="fas fa-exclamation-triangle me-2"></i>Network Error</h6>
        <p class="mb-0">${err.message}</p>
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
</script>