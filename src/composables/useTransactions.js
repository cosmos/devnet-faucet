import { ref, onMounted } from 'vue'

const recentTransactions = ref([])

export function useTransactions() {
  const loadRecentTransactions = () => {
    const saved = localStorage.getItem('faucet-recent-transactions')
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
  
  const saveRecentTransactions = () => {
    localStorage.setItem('faucet-recent-transactions', JSON.stringify(recentTransactions.value))
  }
  
  const addTransactionToHistory = (tx) => {
    tx.id = Date.now() + Math.random()
    recentTransactions.value.unshift(tx)
    
    if (recentTransactions.value.length > 10) {
      recentTransactions.value = recentTransactions.value.slice(0, 10)
    }
    
    saveRecentTransactions()
  }
  
  const removeTransaction = (index) => {
    recentTransactions.value.splice(index, 1)
    saveRecentTransactions()
  }
  
  const clearAllTransactions = () => {
    recentTransactions.value = []
    saveRecentTransactions()
  }
  
  onMounted(() => {
    loadRecentTransactions()
  })
  
  return {
    recentTransactions,
    addTransactionToHistory,
    removeTransaction,
    clearAllTransactions
  }
}