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
import { onMounted, provide, ref } from 'vue'
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

// Initialize Reown AppKit - use ref to make it reactive
const modal = ref(null)

// Provide the modal ref immediately during setup
provide('appKitModal', modal)

// Also provide a simple open function
const openAppKitModal = () => {
  if (modal.value && modal.value.open) {
    modal.value.open()
  }
}
provide('openAppKitModal', openAppKitModal)

// Provide disconnect function
const disconnectAppKit = async () => {
  if (modal.value && modal.value.disconnect) {
    await modal.value.disconnect()
  }
}
provide('disconnectAppKit', disconnectAppKit)

onMounted(async () => {
  try {
    await loadConfig()
    // Only log essential info
    if (config.value && config.value.network) {
      console.log('Faucet configured for network:', config.value.network.evm.chainId)
    }
  } catch (error) {
    console.error('Failed to load config:', error)
    return
  }
  
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
      url: 'https://faucet.basementnodes.ca',
      icons: ['https://faucet.basementnodes.ca/favicon.svg']
    }
    
    // Create Wagmi adapter
    const wagmiAdapter = new WagmiAdapter({
      networks: [customNetwork],
      projectId: import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID'
    })
    
    // Create AppKit modal with enhanced error handling
    try {
      // Check for conflicting wallet extensions
      if (window.ethereum) {
        // Log available providers
        const providers = window.ethereum.providers || [window.ethereum]
        console.log(`Found ${providers.length} wallet provider(s)`)
        
        // If multiple providers exist, try to find MetaMask or a preferred one
        if (window.ethereum.providers && window.ethereum.providers.length > 1) {
          console.warn('Multiple wallet providers detected. This may cause connection issues.')
          // Try to find MetaMask specifically
          const metamaskProvider = window.ethereum.providers.find(p => p.isMetaMask && !p.isBraveWallet)
          if (metamaskProvider) {
            console.log('Using MetaMask provider')
          }
        }
      }
      
      const appKitInstance = createAppKit({
        adapters: [wagmiAdapter],
        networks: [customNetwork],
        projectId: import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID',
        metadata,
        features: {
          analytics: false,
          email: false,
          socials: false,
          swaps: false,
          onramp: false
        },
        // Add additional config to handle multiple wallets
        walletConnectConfig: {
          // Prefer injected wallets when multiple are available
          qrModalOptions: {
            themeVariables: {
              '--wcm-z-index': '10000'
            }
          }
        }
      })
      
      // Update the ref value
      modal.value = appKitInstance
      console.log('Wallet connector initialized')
    } catch (error) {
      console.error('Failed to create AppKit modal:', error)
      // Don't let initialization failure break the app
      console.warn('Wallet connection may be limited due to initialization error')
    }
    
    // Subscribe to account changes
    if (modal.value) {
      
      // Debounce to prevent duplicate events
      let updateTimeout = null
      const updateWalletState = (isConnected, address, chainId) => {
        clearTimeout(updateTimeout)
        updateTimeout = setTimeout(() => {
          if (isConnected && address) {
            walletStore.evmWallet.connected = true
            walletStore.evmWallet.address = address
            walletStore.evmWallet.chainId = chainId
            console.log('EVM wallet connected:', address)
          } else {
            walletStore.evmWallet.connected = false
            walletStore.evmWallet.address = null
            walletStore.evmWallet.chainId = null
            console.log('EVM wallet disconnected')
          }
        }, 100)
      }
      
      // Subscribe to account changes
      if (modal.value.subscribeAccount) {
        modal.value.subscribeAccount((account) => {
          // Only log significant changes
          if (account.status === 'connected' || account.status === 'disconnected') {
            console.log('Account status:', account.status, account.address)
          }
          updateWalletState(account.isConnected, account.address, account.chainId)
        })
      }
      
      // Check initial state after a brief delay
      setTimeout(() => {
        if (modal.value.getAccount) {
          const account = modal.value.getAccount()
          if (account && account.isConnected && account.address) {
            console.log('Initial account connected:', account.address)
            updateWalletState(true, account.address, account.chainId)
          }
        }
      }, 500)
    }
  }
})
</script>