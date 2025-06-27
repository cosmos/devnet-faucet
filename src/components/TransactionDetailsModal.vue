<template>
  <div class="modal-backdrop" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h5 class="modal-title">Transaction Details</h5>
        <button type="button" class="btn-close" @click="$emit('close')"></button>
      </div>
      
      <div class="modal-body">
        <!-- Basic Info -->
        <div class="mb-3">
          <table class="table table-sm">
            <tbody>
              <tr>
                <td class="text-muted">Status:</td>
                <td>
                  <span class="badge" :class="getTransactionBadgeClass(transaction)">
                    {{ getTransactionStatus(transaction) }}
                  </span>
                </td>
              </tr>
              <tr>
                <td class="text-muted">Address:</td>
                <td>
                  <code class="small">{{ transaction.address }}</code>
                  <span class="badge bg-secondary ms-2">{{ transaction.addressType }}</span>
                </td>
              </tr>
              <tr v-if="getActualTransactionHash(transaction)">
                <td class="text-muted">Tx Hash:</td>
                <td><code class="small">{{ getActualTransactionHash(transaction) }}</code></td>
              </tr>
              <tr>
                <td class="text-muted">Timestamp:</td>
                <td>{{ new Date(transaction.timestamp).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Cosmos Transaction Details -->
        <div v-if="isCosmosTransaction" class="mb-3">
          <h6 class="text-primary mb-2">Cosmos Transaction Details</h6>
          
          <div v-if="cosmosData" class="mb-3">
            <table class="table table-sm">
              <tbody>
                <tr v-if="cosmosData.block_height">
                  <td class="text-muted">Block Height:</td>
                  <td>{{ cosmosData.block_height }}</td>
                </tr>
                <tr v-if="cosmosData.gas_used">
                  <td class="text-muted">Gas Used / Wanted:</td>
                  <td>{{ cosmosData.gas_used }} / {{ cosmosData.gas_wanted || 'N/A' }}</td>
                </tr>
                <tr v-if="cosmosData.code !== undefined">
                  <td class="text-muted">Code:</td>
                  <td>
                    <span class="badge" :class="cosmosData.code === 0 ? 'bg-success' : 'bg-danger'">
                      {{ cosmosData.code }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- REST API URL Button -->
          <div v-if="cosmosRestApiUrl" class="text-center mb-3">
            <a :href="cosmosRestApiUrl" target="_blank" class="btn btn-outline-info btn-sm">
              <i class="fas fa-external-link-alt me-1"></i>Open REST API Response
            </a>
          </div>
          
          <!-- Toggle Full JSON -->
          <div class="text-center mb-3">
            <button class="btn btn-outline-secondary btn-sm" @click="showFullJson = !showFullJson">
              <i class="fas" :class="showFullJson ? 'fa-eye-slash' : 'fa-eye'"></i>
              {{ showFullJson ? 'Hide' : 'Show' }} Full Response
            </button>
          </div>
          
          <!-- Full JSON -->
          <div v-if="showFullJson && transaction.data?.result" class="json-container">
            <pre>{{ JSON.stringify(transaction.data.result, null, 2) }}</pre>
          </div>
        </div>
        
        <!-- EVM Transaction Details -->
        <div v-else-if="isEvmTransaction && evmData" class="mb-3">
          <h6 class="text-primary mb-2">EVM Transaction Details</h6>
          
          <table class="table table-sm">
            <tbody>
              <tr v-if="evmData.blockNumber">
                <td class="text-muted">Block Number:</td>
                <td>{{ evmData.blockNumber }}</td>
              </tr>
              <tr v-if="evmData.from">
                <td class="text-muted">From:</td>
                <td><code class="small">{{ evmData.from }}</code></td>
              </tr>
              <tr v-if="evmData.to">
                <td class="text-muted">To:</td>
                <td><code class="small">{{ evmData.to }}</code></td>
              </tr>
              <tr v-if="evmData.gasUsed">
                <td class="text-muted">Gas Used:</td>
                <td>{{ evmData.gasUsed }}</td>
              </tr>
              <tr v-if="evmData.status !== undefined">
                <td class="text-muted">Status:</td>
                <td>
                  <span class="badge" :class="evmData.status === 1 ? 'bg-success' : 'bg-danger'">
                    {{ evmData.status === 1 ? 'Success' : 'Failed' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- Toggle Full JSON -->
          <div class="text-center mb-3">
            <button class="btn btn-outline-secondary btn-sm" @click="showFullJson = !showFullJson">
              <i class="fas" :class="showFullJson ? 'fa-eye-slash' : 'fa-eye'"></i>
              {{ showFullJson ? 'Hide' : 'Show' }} Full Response
            </button>
          </div>
          
          <!-- Full JSON -->
          <div v-if="showFullJson && evmData" class="json-container">
            <pre>{{ JSON.stringify(evmData, null, 2) }}</pre>
          </div>
        </div>
        
        <!-- Token Transfer Summary -->
        <div v-if="hasTokenTransfers" class="mb-3">
          <h6 class="text-primary mb-2">Token Transfers</h6>
          
          <div v-if="transaction.data?.result?.tokens_sent?.length > 0" class="mb-2">
            <strong>Sent:</strong>
            <ul class="mb-0">
              <li v-for="(token, idx) in transaction.data.result.tokens_sent" :key="idx">
                {{ formatTokenAmount(token.amount, token.decimals) }} {{ token.symbol }}
                <span v-if="token.type" class="badge bg-secondary ms-1">{{ token.type }}</span>
              </li>
            </ul>
          </div>
          
          <div v-if="transaction.data?.result?.tokens_not_sent?.length > 0" class="mb-2">
            <strong>Not Sent (Already Funded):</strong>
            <ul class="mb-0">
              <li v-for="(token, idx) in transaction.data.result.tokens_not_sent" :key="idx">
                {{ token.symbol }}
                <span v-if="token.reason" class="text-muted">({{ token.reason }})</span>
              </li>
            </ul>
          </div>
        </div>
        
        <!-- Error Details -->
        <div v-if="!transaction.success && transaction.data?.result" class="mb-3">
          <h6 class="text-danger mb-2">Error Details</h6>
          <div class="alert alert-danger">
            <div v-if="transaction.data.result.message">
              <strong>Message:</strong> {{ transaction.data.result.message }}
            </div>
            <div v-if="transaction.data.result.error">
              <strong>Error:</strong> {{ transaction.data.result.error }}
            </div>
            <div v-if="transaction.data.result.raw_log">
              <strong>Raw Log:</strong>
              <pre class="mb-0 mt-2">{{ transaction.data.result.raw_log }}</pre>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Close</button>
        <a v-if="explorerUrl" :href="explorerUrl" target="_blank" class="btn btn-primary">
          <i class="fas fa-external-link-alt me-1"></i>View on Explorer
        </a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useConfig } from '../composables/useConfig'

const props = defineProps({
  transaction: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const { networkConfig } = useConfig()
const showFullJson = ref(false)

const isCosmosTransaction = computed(() => {
  return props.transaction.data?.result?.network_type === 'cosmos' || 
         props.transaction.addressType === 'cosmos'
})

const isEvmTransaction = computed(() => {
  return props.transaction.data?.result?.network_type === 'evm' || 
         props.transaction.addressType === 'evm'
})

const hasTokenTransfers = computed(() => {
  const result = props.transaction.data?.result
  return (result?.tokens_sent?.length > 0) || (result?.tokens_not_sent?.length > 0)
})

const cosmosData = computed(() => {
  if (!isCosmosTransaction.value) return null
  
  const result = props.transaction.data?.result
  if (!result) return null
  
  const txResponse = result.tx_response || result.cosmos_tx_data?.tx_response || {}
  
  return {
    block_height: result.block_height || result.height || txResponse.height,
    gas_used: result.gas_used || txResponse.gas_used,
    gas_wanted: result.gas_wanted || txResponse.gas_wanted,
    code: result.code !== undefined ? result.code : txResponse.code,
    timestamp: txResponse.timestamp
  }
})

const evmData = computed(() => {
  if (!isEvmTransaction.value) return null
  
  const result = props.transaction.data?.result
  if (!result || !result.evm_tx_data) return null
  
  return result.evm_tx_data
})

const cosmosRestApiUrl = computed(() => {
  if (!isCosmosTransaction.value) return null
  
  // First check if we have a REST API URL already
  if (props.transaction.data?.result?.rest_api_url) {
    return props.transaction.data.result.rest_api_url
  }
  
  // If not, construct one based on the transaction hash
  const hash = getActualTransactionHash(props.transaction)
  if (hash) {
    const restBase = networkConfig.value.cosmos?.rest || 'https://devnet-1-lcd.ib.skip.build'
    return `${restBase}/cosmos/tx/v1beta1/txs/${hash}`
  }
  
  return null
})

const explorerUrl = computed(() => {
  const result = props.transaction.data?.result
  
  // Use provided explorer URL first
  if (result?.explorer_url) return result.explorer_url
  
  // Get the actual transaction hash
  const actualHash = getActualTransactionHash(props.transaction)
  
  // Generate URL based on transaction type and hash
  if (actualHash) {
    if (isEvmTransaction.value) {
      const explorerBase = networkConfig.value.evm?.explorer || 'https://evm-devnet-1.cloud.blockscout.com'
      return `${explorerBase}/tx/${actualHash}`
    } else if (isCosmosTransaction.value) {
      const restBase = networkConfig.value.cosmos?.rest || 'https://devnet-1-lcd.ib.skip.build'
      return `${restBase}/cosmos/tx/v1beta1/txs/${actualHash}`
    }
  }
  
  return null
})

const getActualTransactionHash = (tx) => {
  if (!tx || !tx.data || !tx.data.result) return null
  
  const result = tx.data.result
  
  return result.transaction_hash || 
         result.hash || 
         (result.transactions && result.transactions[0]) ||
         tx.hash ||
         null
}

const getTransactionStatus = (tx) => {
  if (!tx.success) {
    return 'Failed'
  }
  if (tx.data?.result?.status === 'no_tokens_sent' || 
      (tx.data?.result?.tokens_sent?.length === 0)) {
    return 'Already Funded'
  }
  return 'Success'
}

const getTransactionBadgeClass = (tx) => {
  if (!tx.success) {
    return 'bg-danger'
  }
  if (tx.data?.result?.status === 'no_tokens_sent' || 
      (tx.data?.result?.tokens_sent?.length === 0)) {
    return 'bg-warning text-dark'
  }
  return 'bg-success'
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
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--cosmos-accent);
}

.modal-body {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  color: var(--text-primary);
}

.table {
  color: var(--text-primary);
  margin-bottom: 0;
}

.table td {
  padding: 0.5rem;
  border-color: var(--border-color);
}

.json-container {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  max-height: 400px;
  overflow-y: auto;
}

.json-container pre {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-word;
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

.alert {
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid #dc3545;
  color: var(--text-primary);
}

.alert pre {
  background: rgba(0, 0, 0, 0.2);
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
}
</style>