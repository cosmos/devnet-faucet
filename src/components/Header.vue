<template>
  <div class="header">
    <div class="container">
      <div class="d-flex justify-content-between align-items-center">
        <h1 class="h3 mb-0" style="font-weight: 600; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          {{ projectName }}
        </h1>
        <div class="d-flex gap-3">
          <a href="https://cosmos.network" target="_blank" class="text-decoration-none header-link">
            <i class="fas fa-globe me-1"></i>Network
          </a>
          <a href="https://cosmos-docs.mintlify.app/docs" target="_blank" class="text-decoration-none header-link">
            <i class="fas fa-book me-1"></i>Docs
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useConfig } from '../composables/useConfig'

const { config } = useConfig()
const projectName = computed(() => config.value?.project?.name || 'Cosmos EVM Faucet')
</script>

<style scoped>
.header-link {
  color: var(--text-primary);
  opacity: 0.8;
  transition: opacity 0.2s;
}

.header-link:hover {
  opacity: 1;
}
</style>