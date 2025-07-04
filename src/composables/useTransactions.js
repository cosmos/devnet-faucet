import { ref } from 'vue'

const STORAGE_KEY = 'faucet-recent-transactions'
const MAX_TRANSACTIONS = 50

const recentTransactions = ref([])

// Load transactions from localStorage on initialization
const loadRecentTransactions = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      recentTransactions.value = JSON.parse(saved).map(tx => ({
        ...tx,
        timestamp: new Date(tx.timestamp)
      }))
    } catch (e) {
      console.error('Failed to load recent transactions:', e)
      recentTransactions.value = []
    }
  }
}

// Save transactions to localStorage
const saveRecentTransactions = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recentTransactions.value))
}

// Add a transaction to history
const addTransactionToHistory = (tx) => {
  tx.id = Date.now() + Math.random()
  recentTransactions.value.unshift(tx)
  
  if (recentTransactions.value.length > MAX_TRANSACTIONS) {
    recentTransactions.value = recentTransactions.value.slice(0, MAX_TRANSACTIONS)
  }
  
  saveRecentTransactions()
}

// Remove a specific transaction
const removeTransaction = (index) => {
  recentTransactions.value.splice(index, 1)
  saveRecentTransactions()
}

// Clear all transactions
const clearAllTransactions = () => {
  recentTransactions.value = []
  saveRecentTransactions()
}

// Initialize by loading saved transactions
loadRecentTransactions()

export function useTransactions() {
  return {
    recentTransactions,
    addTransactionToHistory,
    removeTransaction,
    clearAllTransactions
  }
}