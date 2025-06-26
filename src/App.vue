<template>
  <div id="app">
    <Header />
    <div class="container">
      <Tabs />
    </div>
    <TransactionModal />
  </div>
</template>

<script setup>
import { onMounted, provide } from 'vue'
import { createAppKit } from '@reown/appkit'
import { mainnet } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import Header from './components/Header.vue'
import Tabs from './components/Tabs.vue'
import TransactionModal from './components/TransactionModal.vue'
import { useConfig } from './composables/useConfig'
import { useWalletStore } from './composables/useWalletStore'

// Load configuration
const { config, loadConfig } = useConfig()
const walletStore = useWalletStore()

// Initialize Reown AppKit
let modal = null

onMounted(async () => {
  await loadConfig()
  
  if (config.value && config.value.network) {
    // Configure custom network based on config
    const customNetwork = {
      id: config.value.network.evm.chainId,
      name: 'Cosmos EVM Devnet-1',
      nativeCurrency: {
        name: 'ATOM',
        symbol: 'ATOM',
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [config.value.network.evm.rpc]
        }
      },
      blockExplorers: {
        default: {
          name: 'Blockscout',
          url: config.value.network.evm.explorer || 'https://evm-devnet-1.cloud.blockscout.com'
        }
      },
      testnet: true
    }
    
    // Create metadata
    const metadata = {
      name: 'Cosmos EVM Faucet',
      description: 'Token distribution faucet for Cosmos EVM Devnet',
      url: window.location.origin,
      icons: ['https://ping.pub/favicon.ico']
    }
    
    // Create Wagmi adapter
    const wagmiAdapter = new WagmiAdapter({
      networks: [customNetwork],
      projectId: import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID'
    })
    
    // Create AppKit modal
    modal = createAppKit({
      adapters: [wagmiAdapter],
      networks: [customNetwork],
      projectId: import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID',
      metadata,
      features: {
        analytics: false,
        email: true,
        socials: ['google', 'github', 'discord']
      }
    })
    
    // Provide modal to child components
    provide('appKitModal', modal)
    
    // Subscribe to account changes
    modal.subscribeAccount((account) => {
      if (account.isConnected && account.address) {
        walletStore.evmWallet.connected = true
        walletStore.evmWallet.address = account.address
        walletStore.evmWallet.chainId = account.chainId
      } else {
        walletStore.evmWallet.connected = false
        walletStore.evmWallet.address = null
        walletStore.evmWallet.chainId = null
      }
    })
  }
})
</script>