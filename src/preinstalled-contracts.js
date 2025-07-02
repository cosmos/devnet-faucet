/**
 * Preinstalled system contracts on Cosmos EVM chains
 * Source: https://github.com/cosmos/evm/blob/029ed3b60088ca698de6714e9615971a85f606fb/x/vm/types/preinstall.go
 * 
 * Note: Create2 and SafeSingletonFactory are minimal CREATE2 factories (85 bytes)
 * using Nick's method for deterministic deployment. They have identical bytecode.
 * Multicall3 and Permit2 are the full implementations of their respective contracts.
 */

export const PREINSTALLED_CONTRACTS = {
    'Create2': {
        address: '0x4e59b44847b379578588920ca78fbf26c0b4956c',
        description: 'Minimal CREATE2 factory for deterministic deployments (Nick\'s method)',
        type: 'system',
        bytecodeHash: '0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989'
    },
    'Multicall3': {
        address: '0xcA11bde05977b3631167028862bE2a173976CA11',
        description: 'Multicall3 - Aggregate multiple contract calls in a single transaction',
        type: 'system'
    },
    'Permit2': {
        address: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
        description: 'Permit2 - Token permit and signature-based approvals',
        type: 'system'
    },
    'SafeSingletonFactory': {
        address: '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7',
        description: 'Minimal CREATE2 factory (identical to Create2)',
        type: 'system',
        bytecodeHash: '0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989'
    }
};

export default PREINSTALLED_CONTRACTS;