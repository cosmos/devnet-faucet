<template>
  <div class="mobile-wallet-modal" v-if="showModal">
    <div class="modal-backdrop" @click="closeModal"></div>
    <div class="modal-content">
      <h5 class="modal-title">
        <i class="fas fa-wallet me-2"></i>
        Connect Mobile Wallet
      </h5>
      
      <div class="wallet-options">
        <!-- Keplr Option -->
        <button class="wallet-option" @click="connectKeplrMobile">
          <div class="wallet-icon">
            <i class="fas fa-atom"></i>
          </div>
          <div class="wallet-info">
            <span class="wallet-name">Keplr</span>
            <small class="wallet-type">Cosmos Wallet</small>
          </div>
          <i class="fas fa-chevron-right"></i>
        </button>
        
        <!-- MetaMask Option -->
        <button class="wallet-option" @click="connectMetaMaskMobile">
          <div class="wallet-icon metamask">
            <i class="fab fa-ethereum"></i>
          </div>
          <div class="wallet-info">
            <span class="wallet-name">MetaMask</span>
            <small class="wallet-type">EVM Wallet</small>
          </div>
          <i class="fas fa-chevron-right"></i>
        </button>
        
        <!-- Rabby Option -->
        <button class="wallet-option" @click="connectRabbyMobile">
          <div class="wallet-icon rabby">
            <i class="fas fa-rabbit"></i>
          </div>
          <div class="wallet-info">
            <span class="wallet-name">Rabby</span>
            <small class="wallet-type">EVM Wallet</small>
          </div>
          <i class="fas fa-chevron-right"></i>
        </button>
        
        <!-- WalletConnect Option -->
        <button class="wallet-option" @click="useWalletConnect">
          <div class="wallet-icon walletconnect">
            <i class="fas fa-link"></i>
          </div>
          <div class="wallet-info">
            <span class="wallet-name">WalletConnect</span>
            <small class="wallet-type">Other Wallets</small>
          </div>
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
      
      <button class="btn btn-secondary btn-sm mt-3" @click="closeModal">
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'

const props = defineProps({
  walletType: String // 'cosmos' or 'evm'
})

const emit = defineEmits(['close'])

// Inject the AppKit modal function
const openAppKitModal = inject('openAppKitModal')

const showModal = ref(true)

const closeModal = () => {
  showModal.value = false
  emit('close')
}

const connectKeplrMobile = () => {
  // For Keplr mobile, we need to use WalletConnect
  // Keplr mobile supports WalletConnect v2
  alert('Keplr mobile connection requires WalletConnect. Please use the WalletConnect option below to connect your Keplr mobile wallet.')
  
  // Alternatively, provide install link if not installed
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (confirm('Would you like to install Keplr mobile wallet?')) {
    if (isIOS) {
      window.open('https://apps.apple.com/app/keplr-wallet/id1567851089', '_blank')
    } else {
      window.open('https://play.google.com/store/apps/details?id=com.chainapsis.keplr', '_blank')
    }
  }
}

const connectMetaMaskMobile = () => {
  // For MetaMask mobile, we should use WalletConnect
  // The direct deep link approach often fails due to browser restrictions
  if (window.ethereum && window.ethereum.isMetaMask) {
    // MetaMask is already available (in-app browser)
    if (openAppKitModal) {
      openAppKitModal()
    }
    closeModal()
  } else {
    // Use WalletConnect for external MetaMask app
    alert('To connect MetaMask mobile, please use the WalletConnect option below and select MetaMask from the list of wallets.')
    
    // Optionally provide install link
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (confirm('Would you like to install MetaMask mobile wallet?')) {
      if (isIOS) {
        window.open('https://apps.apple.com/app/metamask/id1438144202', '_blank')
      } else {
        window.open('https://play.google.com/store/apps/details?id=io.metamask', '_blank')
      }
    }
  }
}

const connectRabbyMobile = () => {
  // Rabby doesn't have a mobile app yet, use WalletConnect
  useWalletConnect()
}

const useWalletConnect = () => {
  // This will trigger the Reown AppKit modal
  if (openAppKitModal) {
    openAppKitModal()
  }
  closeModal()
}
</script>

<style scoped>
.mobile-wallet-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

.modal-content {
  position: relative;
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  z-index: 10000;
}

.modal-title {
  color: var(--cosmos-accent);
  margin-bottom: 1.5rem;
  text-align: center;
}

.wallet-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.wallet-option {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  text-align: left;
  transition: all 0.2s ease;
  width: 100%;
}

.wallet-option:hover {
  border-color: var(--cosmos-accent);
  transform: translateX(4px);
}

.wallet-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border-radius: 8px;
  font-size: 1.25rem;
  color: var(--cosmos-accent);
}

.wallet-icon.metamask {
  color: #f6851b;
}

.wallet-icon.rabby {
  color: #7084f5;
}

.wallet-icon.walletconnect {
  color: #3b99fc;
}

.wallet-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.wallet-name {
  font-weight: 600;
  font-size: 1rem;
}

.wallet-type {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.btn-secondary {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 100%;
}

.btn-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}
</style>