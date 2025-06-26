import { reactive } from 'vue'

const state = reactive({
  cosmosWallet: {
    connected: false,
    connecting: false,
    address: null,
    chainId: null
  },
  evmWallet: {
    connected: false,
    connecting: false,
    address: null,
    chainId: null
  }
})

export function useWalletStore() {
  const connectKeplr = async (networkConfig) => {
    if (!window.keplr) {
      alert('Please install Keplr wallet extension')
      return
    }
    
    state.cosmosWallet.connecting = true
    
    try {
      const chainConfig = {
        chainId: networkConfig.cosmos?.chainId || "4321",
        chainName: "cosmos",
        rpc: networkConfig.cosmos?.rpc || "https://devnet-1-rpc.ib.skip.build",
        rest: networkConfig.cosmos?.rest || "https://devnet-1-lcd.ib.skip.build",
        bip44: {
          coinType: 60
        },
        bech32Config: {
          bech32PrefixAccAddr: "cosmos",
          bech32PrefixAccPub: "cosmospub",
          bech32PrefixValAddr: "cosmosvaloper",
          bech32PrefixValPub: "cosmosvaloperpub",
          bech32PrefixConsAddr: "cosmosvalcons",
          bech32PrefixConsPub: "cosmosvalconspub"
        },
        currencies: [
          {
            coinDenom: "ATOM",
            coinMinimalDenom: "uatom",
            coinDecimals: 6,
            coinGeckoId: "cosmos"
          }
        ],
        feeCurrencies: [
          {
            coinDenom: "ATOM",
            coinMinimalDenom: "uatom",
            coinDecimals: 6,
            coinGeckoId: "cosmos",
            gasPriceStep: {
              low: 0.01,
              average: 0.025,
              high: 0.03
            }
          }
        ],
        stakeCurrency: {
          coinDenom: "ATOM",
          coinMinimalDenom: "uatom",
          coinDecimals: 6,
          coinGeckoId: "cosmos"
        },
        features: [
          "eth-address-gen",
          "eth-key-sign"
        ]
      }
      
      try {
        await window.keplr.experimentalSuggestChain(chainConfig)
      } catch (error) {
        console.warn('Failed to suggest chain, trying to connect anyway:', error)
      }
      
      await window.keplr.enable(chainConfig.chainId)
      
      const offlineSigner = window.keplr.getOfflineSigner(chainConfig.chainId)
      const accounts = await offlineSigner.getAccounts()
      
      if (accounts.length > 0) {
        state.cosmosWallet.connected = true
        state.cosmosWallet.address = accounts[0].address
        state.cosmosWallet.chainId = chainConfig.chainId
      }
    } catch (error) {
      console.error('Error connecting to Keplr:', error)
      alert('Failed to connect to Keplr: ' + error.message)
    } finally {
      state.cosmosWallet.connecting = false
    }
  }
  
  const disconnectKeplr = () => {
    state.cosmosWallet.connected = false
    state.cosmosWallet.address = null
    state.cosmosWallet.chainId = null
  }
  
  const disconnectEvm = () => {
    state.evmWallet.connected = false
    state.evmWallet.address = null
    state.evmWallet.chainId = null
  }
  
  return {
    cosmosWallet: state.cosmosWallet,
    evmWallet: state.evmWallet,
    connectKeplr,
    disconnectKeplr,
    disconnectEvm
  }
}