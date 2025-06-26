<template>
  <div v-if="recentTransactions.length" class="info-card">
    <h5 class="info-title">
      <i class="fas fa-history"></i>
      Recent Transactions
    </h5>
    <div v-for="(tx, index) in recentTransactions" :key="tx.id" class="transaction-item">
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-2 mb-2">
            <i :class="getTransactionIcon(tx)"></i>
            <span class="fw-bold">{{ tx.addressType }} Transaction</span>
            <span class="badge" :class="getTransactionBadgeClass(tx)">
              {{ getTransactionStatus(tx) }}
            </span>
            <small class="text-muted">{{ formatDate(tx.timestamp) }}</small>
          </div>
          <div class="mb-2">
            <strong>To:</strong> 
            <span class="text-monospace">{{ tx.address }}</span>
          </div>
          <div v-if="tx.hash" class="mb-2">
            <strong>Hash:</strong> 
            <span class="text-monospace small">{{ tx.hash }}</span>
          </div>
        </div>
        <div class="text-end">
          <div class="d-flex flex-column gap-1" style="min-width: 100px;">
            <button class="btn btn-outline-danger btn-sm w-100" @click="removeTransaction(index)">
              <i class="fas fa-trash me-1"></i>Delete
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="text-center mt-3">
      <button class="btn btn-outline-secondary btn-sm" @click="clearAllTransactions()">
        <i class="fas fa-trash me-2"></i>Clear All
      </button>
    </div>
  </div>
  <div v-else class="info-card text-center">
    <h5 class="info-title justify-content-center">
      <i class="fas fa-history"></i>
      Recent Transactions
    </h5>
    <p class="text-muted">No recent transactions yet.</p>
  </div>
</template>

<script setup>
import { useTransactions } from '../../composables/useTransactions'

const { recentTransactions, removeTransaction, clearAllTransactions } = useTransactions()

const formatDate = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
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

const getTransactionIcon = (tx) => {
  if (!tx.success) {
    return 'fas fa-exclamation-triangle text-danger'
  }
  if (isNoTokensNeeded(tx)) {
    return 'fas fa-info-circle text-warning'
  }
  if (tx.data?.result?.status === 'partial_success') {
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
  if (tx.data?.result?.status === 'partial_success') {
    return 'bg-success'
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
  if (tx.data?.result?.status === 'partial_success') {
    return 'Success'
  }
  return 'Success'
}
</script>