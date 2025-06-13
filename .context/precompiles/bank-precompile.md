# Bank Precompile Documentation

## Overview
The Bank precompile provides ERC20-style access to native Cosmos SDK tokens, enabling smart contracts to query balances and token supplies through standardized interfaces.

**Precompile Address**: `0x0000000000000000000000000000000000000804`

## Interface

### balances
Query all native token balances for a specific account.

```solidity
function balances(address account) external view returns (Balance[] memory)
```

**Parameters:**
- `account`: Address to query balances for

**Returns:**
- `Balance[]`: Array of all token balances

**Gas Cost**: 2,851 gas

**Usage Example:**
```solidity
// Query all balances for an account
Balance[] memory accountBalances = IBank(BANK_PRECOMPILE).balances(userAddress);

for (uint i = 0; i < accountBalances.length; i++) {
    // accountBalances[i].contractAddress - ERC20 contract address
    // accountBalances[i].amount - Token amount
}
```

### totalSupply
Query total supply of all native tokens in the system.

```solidity
function totalSupply() external view returns (Balance[] memory)
```

**Returns:**
- `Balance[]`: Array of total supplies for all tokens

**Gas Cost**: 2,477 gas

**Usage Example:**
```solidity
// Query total supply of all tokens
Balance[] memory supplies = IBank(BANK_PRECOMPILE).totalSupply();
```

### supplyOf
Query total supply of a specific token by its ERC20 contract address.

```solidity
function supplyOf(address erc20Address) external view returns (uint256)
```

**Parameters:**
- `erc20Address`: ERC20 contract address of the token

**Returns:**
- `uint256`: Total supply of the specified token

**Gas Cost**: 2,477 gas

**Usage Example:**
```solidity
// Query supply of specific token
uint256 supply = IBank(BANK_PRECOMPILE).supplyOf(tokenContract);
```

## Data Structures

### Balance
Represents a token balance with its contract address and amount.

```solidity
struct Balance {
    address contractAddress;  // ERC20 contract address
    uint256 amount;          // Token amount in smallest unit
}
```

**Field Details:**
- `contractAddress`: The ERC20 contract address representing the native token
- `amount`: Token amount in the smallest denomination (e.g., wei equivalent)

## Integration Points

### Cosmos SDK Integration
- Integrates with `x/bank` module for native token operations
- Integrates with `x/erc20` module for token pair mappings
- Provides read-only access to bank state

### ERC20 Compatibility
- Returns addresses of ERC20 contracts that represent native tokens
- Amounts are returned in ERC20-compatible format (18 decimals)
- Can be used alongside standard ERC20 interfaces

## Error Conditions

The precompile may revert in the following cases:
- Invalid address format (not a valid Ethereum address)
- Gas limit exceeded for large queries
- Internal state access errors

## Usage Patterns

### Portfolio Queries
```solidity
contract PortfolioTracker {
    address constant BANK_PRECOMPILE = 0x0000000000000000000000000000000000000804;
    
    function getUserPortfolio(address user) external view returns (Balance[] memory) {
        return IBank(BANK_PRECOMPILE).balances(user);
    }
    
    function getTotalValue(address user) external view returns (uint256 totalValue) {
        Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(user);
        
        for (uint i = 0; i < balances.length; i++) {
            // Add price oracle integration here
            totalValue += calculateValue(balances[i]);
        }
    }
}
```

### Supply Monitoring
```solidity
contract SupplyMonitor {
    address constant BANK_PRECOMPILE = 0x0000000000000000000000000000000000000804;
    
    function checkInflation(address token) external view returns (uint256 currentSupply) {
        return IBank(BANK_PRECOMPILE).supplyOf(token);
    }
    
    function getAllSupplies() external view returns (Balance[] memory) {
        return IBank(BANK_PRECOMPILE).totalSupply();
    }
}
```

### DeFi Protocol Integration
```solidity
contract LendingProtocol {
    address constant BANK_PRECOMPILE = 0x0000000000000000000000000000000000000804;
    
    function calculateCollateralValue(address user) external view returns (uint256) {
        Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(user);
        uint256 totalCollateral = 0;
        
        for (uint i = 0; i < balances.length; i++) {
            if (isAcceptedCollateral(balances[i].contractAddress)) {
                totalCollateral += balances[i].amount * getCollateralRatio(balances[i].contractAddress) / 10000;
            }
        }
        
        return totalCollateral;
    }
    
    function isAcceptedCollateral(address token) internal pure returns (bool) {
        // Implementation for checking accepted collateral tokens
        return true;
    }
    
    function getCollateralRatio(address token) internal pure returns (uint256) {
        // Implementation for getting collateral ratios
        return 8000; // 80%
    }
}
```

## Gas Optimization Tips

1. **Batch Queries**: Use `balances()` instead of multiple individual queries when possible
2. **Selective Processing**: Filter results early to avoid processing unwanted tokens
3. **Caching**: Store frequently accessed data to avoid repeated precompile calls
4. **Supply Checks**: Use `supplyOf()` for single token queries rather than `totalSupply()`

## Security Considerations

1. **Read-Only**: This precompile only provides read access, no state modifications
2. **Gas Limits**: Large portfolios may exceed gas limits in complex calculations
3. **Address Validation**: Always validate addresses before querying
4. **Price Oracle Dependence**: Token valuations require external price feeds

## Integration with Other Precompiles

### With ERC20 Precompile
```solidity
// Get balance from bank precompile, then interact with ERC20
Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(user);
for (uint i = 0; i < balances.length; i++) {
    IERC20 token = IERC20(balances[i].contractAddress);
    string memory name = token.name();
    string memory symbol = token.symbol();
}
```

### With Staking Precompile
```solidity
// Check liquid balances vs staked amounts
Balance[] memory liquidBalances = IBank(BANK_PRECOMPILE).balances(user);
// Compare with staking positions from staking precompile
```

This precompile provides essential balance and supply query functionality for DeFi applications, portfolio trackers, and any smart contract needing access to native token information.