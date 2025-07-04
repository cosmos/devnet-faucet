import { ref } from 'vue'

const config = ref(null)
const sampleAddresses = ref({ cosmos: '', evm: '' })
const tokenInfo = ref([])
const networkConfig = ref({
  cosmos: { chainId: '', rpc: '', grpc: '', rest: '' },
  evm: { chainId: '', chainIdHex: '', rpc: '', websocket: '', explorer: '' },
  contracts: {}
})

export function useConfig() {
  const loadConfig = async () => {
    try {
      const response = await fetch('/config.json')
      const data = await response.json()
      
      config.value = data
      sampleAddresses.value = data.sample || { cosmos: '', evm: '' }
      tokenInfo.value = data.tokens || []
      
      if (data.network) {
        networkConfig.value = data.network
      }
      
      return data
    } catch (error) {
      console.error('Failed to load config:', error)
      throw error
    }
  }
  
  return {
    config,
    sampleAddresses,
    tokenInfo,
    networkConfig,
    loadConfig
  }
}