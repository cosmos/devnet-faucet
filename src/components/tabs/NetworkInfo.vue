<template>
  <div class="info-grid">
    <!-- Cosmos Network -->
    <div class="info-card">
      <h5 class="info-title">
        <i class="fas fa-atom"></i>
        Cosmos Network
      </h5>
      <div class="info-item">
        <span class="info-label">Chain ID:</span>
        <span class="info-value">{{ networkConfig.cosmos?.chainId || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">RPC:</span>
        <span class="info-value">{{ networkConfig.cosmos?.rpc || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">gRPC:</span>
        <span class="info-value">{{ networkConfig.cosmos?.grpc || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">REST:</span>
        <span class="info-value">{{ networkConfig.cosmos?.rest || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Faucet:</span>
        <span class="info-value">{{ networkConfig.faucetAddresses?.cosmos || 'Loading...' }}</span>
      </div>
    </div>

    <!-- EVM Network -->
    <div class="info-card">
      <h5 class="info-title">
        <i class="fab fa-ethereum"></i>
        EVM Network
      </h5>
      <div class="info-item">
        <span class="info-label">Chain ID:</span>
        <span class="info-value">{{ networkConfig.evm?.chainId || 'Loading...' }} ({{ networkConfig.evm?.chainIdHex || '0x...' }})</span>
      </div>
      <div class="info-item">
        <span class="info-label">RPC:</span>
        <span class="info-value">{{ networkConfig.evm?.rpc || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">WebSocket:</span>
        <span class="info-value">{{ networkConfig.evm?.websocket || 'Loading...' }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Faucet:</span>
        <span class="info-value">{{ networkConfig.faucetAddresses?.evm || 'Loading...' }}</span>
      </div>
    </div>
  </div>

  <!-- Contract Addresses -->
  <div v-if="networkConfig.contracts && Object.keys(networkConfig.contracts).length" class="info-card mt-3">
    <h5 class="info-title">
      <i class="fas fa-file-contract"></i>
      Smart Contracts
    </h5>
    
    <!-- System Contracts -->
    <div class="mb-3">
      <h6 class="text-primary mb-2">System Contracts</h6>
      <div v-if="networkConfig.contracts.atomicMultiSend" class="info-item">
        <span class="info-label">AtomicMultiSend:</span>
        <span class="info-value">{{ networkConfig.contracts.atomicMultiSend }}</span>
      </div>
      <div v-if="networkConfig.contracts.native_token" class="info-item">
        <span class="info-label">Native ATOM (ERC20):</span>
        <span class="info-value">{{ networkConfig.contracts.native_token }}</span>
      </div>
      <div v-if="networkConfig.contracts.werc20_precompile" class="info-item">
        <span class="info-label">WERC20 Precompile:</span>
        <span class="info-value">{{ networkConfig.contracts.werc20_precompile }}</span>
      </div>
    </div>
    
    <!-- ERC20 Token Contracts -->
    <div v-if="networkConfig.contracts.erc20_tokens && Object.keys(networkConfig.contracts.erc20_tokens).length">
      <h6 class="text-success mb-2">ERC20 Token Contracts</h6>
      <div class="info-item" v-for="(address, symbol) in networkConfig.contracts.erc20_tokens" :key="symbol">
        <span class="info-label">{{ symbol }}:</span>
        <span class="info-value">{{ address }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useConfig } from '../../composables/useConfig'

const { networkConfig } = useConfig()
</script>