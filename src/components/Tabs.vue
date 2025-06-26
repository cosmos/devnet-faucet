<template>
  <div>
    <ul class="nav nav-tabs" role="tablist">
      <li class="nav-item" role="presentation">
        <button 
          class="nav-link"
          :class="{ active: activeTab === 'network' }"
          @click="activeTab = 'network'"
          type="button"
          role="tab"
        >
          <i class="fas fa-network-wired me-2"></i>Network Info
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          class="nav-link"
          :class="{ active: activeTab === 'faucet' }"
          @click="activeTab = 'faucet'"
          type="button"
          role="tab"
        >
          <i class="fas fa-faucet me-2"></i>Token Faucet
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          class="nav-link"
          :class="{ active: activeTab === 'recent' }"
          @click="activeTab = 'recent'"
          type="button"
          role="tab"
        >
          <i class="fas fa-history me-2"></i>Recent Txs
          <span v-if="recentTransactions.length" class="badge bg-primary ms-1">
            {{ recentTransactions.length }}
          </span>
        </button>
      </li>
    </ul>
    
    <div class="tab-content">
      <NetworkInfo v-if="activeTab === 'network'" />
      <FaucetTab v-if="activeTab === 'faucet'" />
      <RecentTransactions v-if="activeTab === 'recent'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NetworkInfo from './tabs/NetworkInfo.vue'
import FaucetTab from './tabs/FaucetTab.vue'
import RecentTransactions from './tabs/RecentTransactions.vue'
import { useTransactions } from '../composables/useTransactions'

const activeTab = ref('faucet')
const { recentTransactions } = useTransactions()
</script>