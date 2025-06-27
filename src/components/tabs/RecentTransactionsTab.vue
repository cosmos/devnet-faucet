<template>
  <div>
    <div v-if="recentTransactions.length > 0">
      <div v-for="(tx, index) in recentTransactions" :key="index" class="transaction-item">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center mb-2">
              <i :class="getTransactionIcon(tx)" class="me-2"></i>
              <span class="badge" :class="getTransactionBadgeClass(tx)">
                {{ getTransactionStatus(tx) }}
              </span>
              <span class="ms-2 text-muted small">{{ formatDate(tx.timestamp) }}</span>
            </div>
            
            <div class="mb-2">
              <strong>Address:</strong> 
              <code class="small">{{ tx.address }}</code>
              <span class="badge bg-secondary ms-2">{{ tx.addressType }}</span>
            </div>
            
            <!-- Show transaction hash if available -->
            <div v-if="getActualTransactionHash(tx)" class="mb-2">
              <strong>Tx Hash:</strong> 
              <code class="small">{{ getActualTransactionHash(tx) }}</code>
            </div>
            
            <!-- Show error message if failed -->
            <div v-if="!tx.success && tx.data?.result?.message" class="mb-2 text-danger">
              <i class="fas fa-exclamation-circle me-1"></i>
              <span>{{ tx.data.result.message }}</span>
            </div>
            
            <!-- Show token summary -->
            <div v-if="tx.data?.result?.tokens_sent && tx.data.result.tokens_sent.length > 0" class="mb-1">
              <small class="text-muted">Sent: 
                <span v-for="(token, idx) in tx.data.result.tokens_sent" :key="idx">
                  {{ formatTokenAmount(token.amount, token.decimals) }} {{ token.symbol }}<span v-if="idx < tx.data.result.tokens_sent.length - 1">, </span>
                </span>
              </small>
            </div>
            
            <div v-if="tx.data?.result?.tokens_not_sent && tx.data.result.tokens_not_sent.length > 0" class="mb-1">
              <small class="text-muted">Already funded: 
                <span v-for="(token, idx) in tx.data.result.tokens_not_sent" :key="idx">
                  {{ token.symbol }}<span v-if="idx < tx.data.result.tokens_not_sent.length - 1">, </span>
                </span>
              </small>
            </div>
          </div>
          
          <div class="text-end">
            <div class="d-flex flex-column gap-1" style="min-width: 100px;">
              <button class="btn btn-outline-primary btn-sm w-100" @click="showTransactionDetails(tx)">
                <i class="fas fa-eye me-1"></i>Details
              </button>
              <a v-if="getTransactionExplorerUrl(tx)" 
                 :href="getTransactionExplorerUrl(tx)" 
                 target="_blank" 
                 class="btn btn-outline-success btn-sm w-100">
                <i class="fas fa-external-link-alt me-1"></i>{{ getTransactionExplorerLabel(tx) }}
              </a>
              <button v-else class="btn btn-outline-secondary btn-sm w-100 disabled" disabled>
                <i class="fas fa-external-link-alt me-1"></i>View
              </button>
              <button class="btn btn-outline-danger btn-sm w-100" @click="removeTransaction(index)">
                <i class="fas fa-trash me-1"></i>Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="text-center mt-3">
        <button class="btn btn-outline-secondary btn-sm" @click="clearAllTransactions">
          <i class="fas fa-trash me-2"></i>Clear All
        </button>
      </div>
    </div>
    
    <div v-else class="text-center py-4">
      <i class="fas fa-history fa-3x text-muted mb-3"></i>
      <h5 class="text-muted">No Recent Transactions</h5>
      <p class="text-muted">Your transaction history will appear here.</p>
    </div>
    
    <!-- Transaction Details Modal -->
    <TransactionDetailsModal 
      v-if="selectedTransaction"
      :transaction="selectedTransaction"
      @close="selectedTransaction = null"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useConfig } from '../../composables/useConfig'
import { useTransactions } from '../../composables/useTransactions'
import TransactionDetailsModal from '../TransactionDetailsModal.vue'

const { networkConfig } = useConfig()
const { recentTransactions, removeTransaction, clearAllTransactions } = useTransactions()

const selectedTransaction = ref(null)

const showTransactionDetails = (tx) => {
  selectedTransaction.value = tx
}

const getActualTransactionHash = (tx) => {
  if (!tx || !tx.data || !tx.data.result) return null
  
  const result = tx.data.result
  
  return result.transaction_hash || 
         result.hash || 
         (result.transactions && result.transactions[0]) ||
         tx.hash ||
         null
}

const getTransactionIcon = (tx) => {
  if (!tx.success) {
    return 'fas fa-exclamation-triangle text-danger'
  }
  if (isNoTokensNeeded(tx)) {
    return 'fas fa-info-circle text-warning'
  }
  return 'fas fa-check-circle text-success'
}

const getTransactionBadgeClass = (tx) => {
  if (!tx.success) {
    return 'bg-danger'
  }
  if (isNoTokensNeeded(tx)) {
    return 'bg-warning text-dark'
  }
  return 'bg-success'
}

const getTransactionStatus = (tx) => {
  if (!tx.success) {
    return 'Failed'
  }
  if (isNoTokensNeeded(tx)) {
    return 'Already Funded'
  }
  return 'Success'
}

const isNoTokensNeeded = (tx) => {
  if (tx.data?.result?.message?.includes('sufficient balance')) {
    return true
  }
  if (tx.data?.result?.tokens_sent && tx.data.result.tokens_sent.length === 0) {
    return true
  }
  if (tx.data?.result?.status === 'no_tokens_sent') {
    return true
  }
  return false
}

const getTransactionExplorerUrl = (tx) => {
  if (!tx || !tx.data || !tx.data.result) return null
  
  const result = tx.data.result
  
  // Use provided explorer URL first
  if (result.explorer_url) return result.explorer_url
  
  // Get the actual transaction hash
  const actualHash = getActualTransactionHash(tx)
  
  // Generate URL based on transaction type and hash
  if (actualHash) {
    if (result.network_type === 'evm' || tx.addressType === 'evm') {
      // EVM transaction - use blockscout explorer
      const explorerBase = networkConfig.value.evm?.explorer || 'https://evm-devnet-1.cloud.blockscout.com'
      return `${explorerBase}/tx/${actualHash}`
    } else if (result.network_type === 'cosmos' || tx.addressType === 'cosmos') {
      // Cosmos transaction - use REST API endpoint
      const restBase = networkConfig.value.cosmos?.rest || 'https://devnet-1-lcd.ib.skip.build'
      return `${restBase}/cosmos/tx/v1beta1/txs/${actualHash}`
    }
  }
  
  return null
}

const getTransactionExplorerLabel = (tx) => {
  if (!tx || !tx.data || !tx.data.result) return 'View'
  
  const result = tx.data.result
  
  if (result.explorer_url) return 'View on Explorer'
  
  // Generate label based on transaction type
  if (getActualTransactionHash(tx)) {
    if (result.network_type === 'evm' || tx.addressType === 'evm') {
      return 'View on Blockscout'
    } else if (result.network_type === 'cosmos' || tx.addressType === 'cosmos') {
      return 'View REST API'
    }
  }
  
  return 'View'
}

const formatTokenAmount = (amount, decimals = 18) => {
  if (!amount) return '0'
  
  try {
    const bigAmount = BigInt(amount)
    const divisor = BigInt(10 ** decimals)
    const whole = bigAmount / divisor
    const fraction = bigAmount % divisor
    
    if (fraction === 0n) {
      return whole.toString()
    } else {
      const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
      return `${whole.toString()}.${fractionStr}`
    }
  } catch (error) {
    return amount.toString()
  }
}

const formatDate = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<style scoped>
.transaction-item {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 1rem;
  background: var(--bg-primary);
  transition: border-color 0.2s ease;
}

.transaction-item:hover {
  border-color: var(--cosmos-accent);
}

.transaction-item:last-child {
  margin-bottom: 0;
}

.transaction-item .btn-sm {
  font-size: 0.8125rem;
  padding: 0.375rem 0.5rem;
  text-align: center;
  white-space: nowrap;
}

.text-success {
  color: #28a745;
}

.text-danger {
  color: #dc3545;
}

.text-warning {
  color: #ffc107;
}

.bg-success {
  background-color: #28a745;
}

.bg-danger {
  background-color: #dc3545;
}

.bg-warning {
  background-color: #ffc107;
}
</style>