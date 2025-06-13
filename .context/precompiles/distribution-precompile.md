# Distribution Precompile Documentation

## Overview
The Distribution precompile provides access to Cosmos SDK distribution functionality, enabling smart contracts to claim staking rewards, manage withdraw addresses, and interact with the community pool.

**Precompile Address**: `0x0000000000000000000000000000000000000801`

## Transaction Methods

### claimRewards
Claims staking rewards from multiple validators with a specified maximum number of validators to process.

```solidity
function claimRewards(
    address delegatorAddress,
    uint32 maxRetrieve
) external returns (bool)
```

**Parameters:**
- `delegatorAddress`: Address of the delegator (must be msg.sender)
- `maxRetrieve`: Maximum number of validators to claim from (gas optimization)

**Returns:**
- `bool`: Success status

**Event:**
```solidity
event ClaimRewards(address indexed delegatorAddress, uint256 amount);
```

**Usage Example:**
```solidity
// Claim rewards from up to 10 validators
IDistribution(DISTRIBUTION_PRECOMPILE).claimRewards(msg.sender, 10);
```

### setWithdrawAddress
Sets the withdrawal address for receiving staking rewards.

```solidity
function setWithdrawAddress(
    address delegatorAddress,
    string memory withdrawerAddress
) external returns (bool)
```

**Parameters:**
- `delegatorAddress`: Delegator address (must be msg.sender)
- `withdrawerAddress`: Bech32 address to receive rewards

**Event:**
```solidity
event SetWithdrawerAddress(address indexed caller, string withdrawerAddress);
```

**Usage Example:**
```solidity
// Set withdrawal address to a different account
IDistribution(DISTRIBUTION_PRECOMPILE).setWithdrawAddress(
    msg.sender,
    "cosmos1withdraweraddress..."
);
```

### withdrawDelegatorRewards
Withdraws staking rewards from a specific validator.

```solidity
function withdrawDelegatorRewards(
    address delegatorAddress,
    string memory validatorAddress
) external returns (Coin[] memory)
```

**Parameters:**
- `delegatorAddress`: Delegator address (must be msg.sender)
- `validatorAddress`: Bech32 address of the validator

**Returns:**
- `Coin[]`: Array of withdrawn rewards

**Event:**
```solidity
event WithdrawDelegatorReward(address indexed delegatorAddress, address indexed validatorAddress, uint256 amount);
```

### withdrawValidatorCommission
Withdraws validator commission (only callable by validator operator).

```solidity
function withdrawValidatorCommission(
    string memory validatorAddress
) external returns (Coin[] memory)
```

**Parameters:**
- `validatorAddress`: Bech32 address of the validator

**Returns:**
- `Coin[]`: Array of withdrawn commission

**Event:**
```solidity
event WithdrawValidatorCommission(string indexed validatorAddress, uint256 commission);
```

### fundCommunityPool
Sends tokens to the community pool.

```solidity
function fundCommunityPool(
    address depositor,
    Coin[] memory amount
) external returns (bool)
```

**Parameters:**
- `depositor`: Address funding the pool (must be msg.sender)
- `amount`: Array of coins to deposit

**Event:**
```solidity
event FundCommunityPool(address indexed depositor, string denom, uint256 amount);
```

### depositValidatorRewardsPool
Deposits tokens into a specific validator's rewards pool.

```solidity
function depositValidatorRewardsPool(
    address depositor,
    string memory validatorAddress,
    Coin[] memory amount
) external returns (bool)
```

**Parameters:**
- `depositor`: Address making the deposit (must be msg.sender)
- `validatorAddress`: Target validator bech32 address
- `amount`: Array of coins to deposit

**Event:**
```solidity
event DepositValidatorRewardsPool(address indexed depositor, address indexed validatorAddress, string denom, uint256 amount);
```

## Query Methods

### validatorDistributionInfo
Queries distribution information for a validator.

```solidity
function validatorDistributionInfo(
    string memory validatorAddress
) external view returns (ValidatorDistributionInfo memory)
```

### validatorOutstandingRewards
Queries outstanding rewards for a validator.

```solidity
function validatorOutstandingRewards(
    string memory validatorAddress
) external view returns (DecCoin[] memory)
```

### validatorCommission
Queries accumulated commission for a validator.

```solidity
function validatorCommission(
    string memory validatorAddress
) external view returns (DecCoin[] memory)
```

### validatorSlashes
Queries validator slash events with pagination.

```solidity
function validatorSlashes(
    string memory validatorAddress,
    uint64 startingHeight,
    uint64 endingHeight,
    PageRequest memory pagination
) external view returns (ValidatorSlashEvent[] memory, PageResponse memory)
```

### delegationRewards
Queries pending rewards for a specific delegation.

```solidity
function delegationRewards(
    address delegatorAddress,
    string memory validatorAddress
) external view returns (DecCoin[] memory)
```

### delegationTotalRewards
Queries total pending rewards across all delegations.

```solidity
function delegationTotalRewards(
    address delegatorAddress
) external view returns (DelegationDelegatorReward[] memory, DecCoin[] memory)
```

**Returns:**
- `DelegationDelegatorReward[]`: Rewards per validator
- `DecCoin[]`: Total rewards across all validators

### delegatorValidators
Queries all validators that a delegator has rewards from.

```solidity
function delegatorValidators(
    address delegatorAddress
) external view returns (string[] memory)
```

### delegatorWithdrawAddress
Queries the withdrawal address for a delegator.

```solidity
function delegatorWithdrawAddress(
    address delegatorAddress
) external view returns (string memory)
```

### communityPool
Queries the current community pool balance.

```solidity
function communityPool() external view returns (DecCoin[] memory)
```

## Data Structures

### ValidatorDistributionInfo
Distribution information for a validator.

```solidity
struct ValidatorDistributionInfo {
    string operatorAddress;      // Validator operator address
    DecCoin[] selfBondRewards;   // Self-bond rewards
    DecCoin[] commission;        // Accumulated commission
}
```

### DelegationDelegatorReward
Rewards from a specific validator.

```solidity
struct DelegationDelegatorReward {
    string validatorAddress;  // Validator bech32 address
    DecCoin[] reward;        // Reward coins
}
```

### ValidatorSlashEvent
Information about a validator slash event.

```solidity
struct ValidatorSlashEvent {
    uint64 validatorPeriod;  // Validator period when slashed
    Dec fraction;            // Slash fraction
}
```

### DecCoin
Decimal coin representation for precise calculations.

```solidity
struct DecCoin {
    string denom;      // Token denomination
    uint256 amount;    // Amount (with precision)
    uint8 precision;   // Decimal precision
}
```

### Dec
Decimal number representation.

```solidity
struct Dec {
    uint256 value;     // Decimal value
    uint8 precision;   // Decimal precision
}
```

## Usage Examples

### Auto-Compound Rewards
```solidity
contract AutoCompounder {
    address constant DISTRIBUTION_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    address constant STAKING_PRECOMPILE = 0x0000000000000000000000000000000000000800;
    
    mapping(address => string) public preferredValidator;
    
    function setPreferredValidator(string memory validatorAddress) external {
        preferredValidator[msg.sender] = validatorAddress;
    }
    
    function compound() external {
        string memory validator = preferredValidator[msg.sender];
        require(bytes(validator).length > 0, "No preferred validator set");
        
        // Withdraw rewards
        Coin[] memory rewards = IDistribution(DISTRIBUTION_PRECOMPILE)
            .withdrawDelegatorRewards(msg.sender, validator);
        
        // Re-delegate rewards
        if (rewards.length > 0 && rewards[0].amount > 0) {
            IStaking(STAKING_PRECOMPILE).delegate(
                msg.sender,
                validator,
                rewards[0].amount
            );
        }
    }
    
    function compoundAll() external {
        // Get all validators with rewards
        string[] memory validators = IDistribution(DISTRIBUTION_PRECOMPILE)
            .delegatorValidators(msg.sender);
        
        for (uint i = 0; i < validators.length; i++) {
            // Withdraw from each validator
            Coin[] memory rewards = IDistribution(DISTRIBUTION_PRECOMPILE)
                .withdrawDelegatorRewards(msg.sender, validators[i]);
            
            // Re-delegate to same validator
            if (rewards.length > 0 && rewards[0].amount > 0) {
                IStaking(STAKING_PRECOMPILE).delegate(
                    msg.sender,
                    validators[i],
                    rewards[0].amount
                );
            }
        }
    }
}
```

### Rewards Distribution Pool
```solidity
contract RewardsPool {
    address constant DISTRIBUTION_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    
    mapping(address => uint256) public shares;
    uint256 public totalShares;
    
    function collectAndDistribute() external {
        // Collect rewards from all validators
        IDistribution(DISTRIBUTION_PRECOMPILE).claimRewards(address(this), 50);
        
        // Get total balance
        uint256 totalBalance = address(this).balance;
        
        // Distribute proportionally to shareholders
        for (uint i = 0; i < shareholders.length; i++) {
            address shareholder = shareholders[i];
            uint256 userShares = shares[shareholder];
            uint256 reward = (totalBalance * userShares) / totalShares;
            
            if (reward > 0) {
                payable(shareholder).transfer(reward);
            }
        }
    }
    
    address[] public shareholders;
    
    function addShareholder(address user, uint256 userShares) external {
        if (shares[user] == 0) {
            shareholders.push(user);
        }
        shares[user] += userShares;
        totalShares += userShares;
    }
}
```

### Validator Commission Tracker
```solidity
contract CommissionTracker {
    address constant DISTRIBUTION_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    
    mapping(string => uint256) public lastWithdrawal;
    
    function getValidatorCommission(string memory validatorAddress) 
        external view returns (DecCoin[] memory) {
        return IDistribution(DISTRIBUTION_PRECOMPILE)
            .validatorCommission(validatorAddress);
    }
    
    function withdrawAndTrack(string memory validatorAddress) external {
        // Only validator operator can call this
        Coin[] memory commission = IDistribution(DISTRIBUTION_PRECOMPILE)
            .withdrawValidatorCommission(validatorAddress);
        
        // Track withdrawal
        lastWithdrawal[validatorAddress] = block.timestamp;
        
        // Emit custom event with commission details
        emit CommissionWithdrawn(validatorAddress, commission);
    }
    
    event CommissionWithdrawn(string indexed validator, Coin[] commission);
}
```

### Delegation Rewards Dashboard
```solidity
contract RewardsDashboard {
    address constant DISTRIBUTION_PRECOMPILE = 0x0000000000000000000000000000000000000801;
    
    function getDelegatorSummary(address delegator) 
        external view returns (
            DelegationDelegatorReward[] memory rewards,
            DecCoin[] memory totalRewards,
            string[] memory validators,
            string memory withdrawAddress
        ) {
        
        // Get all reward information
        (rewards, totalRewards) = IDistribution(DISTRIBUTION_PRECOMPILE)
            .delegationTotalRewards(delegator);
        
        validators = IDistribution(DISTRIBUTION_PRECOMPILE)
            .delegatorValidators(delegator);
        
        withdrawAddress = IDistribution(DISTRIBUTION_PRECOMPILE)
            .delegatorWithdrawAddress(delegator);
    }
    
    function getValidatorRewards(
        address delegator,
        string memory validatorAddress
    ) external view returns (DecCoin[] memory) {
        return IDistribution(DISTRIBUTION_PRECOMPILE)
            .delegationRewards(delegator, validatorAddress);
    }
}
```

## Gas Costs and Optimization

### Transaction Gas Costs
- `claimRewards`: ~100,000 + (validators * 50,000) gas
- `withdrawDelegatorRewards`: ~80,000 gas
- `setWithdrawAddress`: ~60,000 gas
- `withdrawValidatorCommission`: ~70,000 gas
- `fundCommunityPool`: ~100,000 gas

### Query Gas Costs
- Single delegation rewards: ~3,000 gas
- Total rewards query: ~5,000 + (validators * 1,000) gas
- Validator info queries: ~2,000-4,000 gas

### Optimization Tips
1. **Batch Claiming**: Use `claimRewards` with appropriate `maxRetrieve` limit
2. **Selective Withdrawal**: Withdraw from specific validators when rewards are substantial
3. **Caching**: Cache validator lists to avoid repeated queries
4. **Gas Estimation**: Estimate gas for reward operations based on delegation count

## Security Considerations

1. **Authorization**: All transaction methods require msg.sender to be the delegator/validator
2. **Withdrawal Address**: Verify withdrawal addresses to prevent reward theft
3. **Gas Limits**: Large delegation portfolios may hit gas limits
4. **Precision Handling**: DecCoin values include precision for accurate calculations
5. **Validator Verification**: Ensure validator addresses are valid before operations

## Integration with Other Precompiles

### With Staking Precompile
```solidity
// Auto-compound: withdraw rewards and re-stake
Coin[] memory rewards = IDistribution(DISTRIBUTION_PRECOMPILE)
    .withdrawDelegatorRewards(user, validator);
    
if (rewards.length > 0) {
    IStaking(STAKING_PRECOMPILE).delegate(user, validator, rewards[0].amount);
}
```

### With Bank Precompile
```solidity
// Check balance before and after reward withdrawal
Balance[] memory beforeBalance = IBank(BANK_PRECOMPILE).balances(user);
IDistribution(DISTRIBUTION_PRECOMPILE).claimRewards(user, 10);
Balance[] memory afterBalance = IBank(BANK_PRECOMPILE).balances(user);
```

This precompile provides comprehensive reward management functionality for building auto-compounding strategies, delegation pools, and validator operation tools.