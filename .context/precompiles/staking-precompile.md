# Staking Precompile Documentation

## Overview
The Staking precompile provides comprehensive access to Cosmos SDK staking functionality, enabling smart contracts to create validators, delegate tokens, and query staking information.

**Precompile Address**: `0x0000000000000000000000000000000000000800`

## Transaction Methods

### createValidator
Creates a new validator with the specified parameters.

```solidity
function createValidator(
    Description memory description,
    CommissionRates memory commissionRates,
    uint256 minSelfDelegation,
    address validatorAddress,
    string memory pubkey,
    uint256 value
) external returns (bool)
```

**Parameters:**
- `description`: Validator description information
- `commissionRates`: Commission rate configuration
- `minSelfDelegation`: Minimum self-delegation amount
- `validatorAddress`: Validator operator address
- `pubkey`: Validator consensus public key (base64 encoded)
- `value`: Initial self-delegation amount

**Returns:**
- `bool`: Success status

**Event:**
```solidity
event CreateValidator(address indexed validatorAddress, uint256 value);
```

### editValidator
Modifies an existing validator's parameters.

```solidity
function editValidator(
    Description memory description,
    address validatorAddress,
    int256 commissionRate,
    int256 minSelfDelegation
) external returns (bool)
```

**Parameters:**
- `description`: Updated validator description
- `validatorAddress`: Validator operator address
- `commissionRate`: New commission rate (-1 to keep unchanged)
- `minSelfDelegation`: New minimum self-delegation (-1 to keep unchanged)

**Event:**
```solidity
event EditValidator(address indexed validatorAddress, int256 commissionRate, int256 minSelfDelegation);
```

### delegate
Delegates tokens to a validator.

```solidity
function delegate(
    address delegatorAddress,
    string memory validatorAddress,
    uint256 amount
) external returns (bool)
```

**Parameters:**
- `delegatorAddress`: Address of the delegator (must be msg.sender)
- `validatorAddress`: Bech32 address of the validator
- `amount`: Amount to delegate

**Event:**
```solidity
event Delegate(address indexed delegatorAddress, address indexed validatorAddress, uint256 amount, uint256 newShares);
```

### undelegate
Undelegates tokens from a validator with a 21-day unbonding period.

```solidity
function undelegate(
    address delegatorAddress,
    string memory validatorAddress,
    uint256 amount
) external returns (int64 completionTime)
```

**Parameters:**
- `delegatorAddress`: Address of the delegator (must be msg.sender)
- `validatorAddress`: Bech32 address of the validator
- `amount`: Amount to undelegate

**Returns:**
- `int64`: Unix timestamp when tokens will be available

**Event:**
```solidity
event Unbond(address indexed delegatorAddress, address indexed validatorAddress, uint256 amount, uint256 completionTime);
```

### redelegate
Moves delegation from one validator to another without unbonding period.

```solidity
function redelegate(
    address delegatorAddress,
    string memory validatorSrcAddress,
    string memory validatorDstAddress,
    uint256 amount
) external returns (int64 completionTime)
```

**Parameters:**
- `delegatorAddress`: Address of the delegator (must be msg.sender)
- `validatorSrcAddress`: Source validator bech32 address
- `validatorDstAddress`: Destination validator bech32 address
- `amount`: Amount to redelegate

**Event:**
```solidity
event Redelegate(address indexed delegatorAddress, address indexed validatorSrcAddress, address indexed validatorDstAddress, uint256 amount, uint256 completionTime);
```

### cancelUnbondingDelegation
Cancels an unbonding delegation and re-delegates the tokens.

```solidity
function cancelUnbondingDelegation(
    address delegatorAddress,
    string memory validatorAddress,
    uint256 amount,
    uint256 creationHeight
) external returns (bool)
```

**Parameters:**
- `delegatorAddress`: Address of the delegator (must be msg.sender)
- `validatorAddress`: Validator bech32 address
- `amount`: Amount to cancel unbonding for
- `creationHeight`: Block height when unbonding was created

**Event:**
```solidity
event CancelUnbondingDelegation(address indexed delegatorAddress, address indexed validatorAddress, uint256 amount, uint256 creationHeight);
```

## Query Methods

### delegation
Queries delegation information between a delegator and validator.

```solidity
function delegation(
    address delegatorAddress,
    string memory validatorAddress
) external view returns (uint256 shares, Coin memory balance)
```

**Returns:**
- `shares`: Number of validator shares owned
- `balance`: Equivalent token amount

### unbondingDelegation
Queries unbonding delegation information.

```solidity
function unbondingDelegation(
    address delegatorAddress,
    string memory validatorAddress
) external view returns (UnbondingDelegationOutput memory)
```

### validator
Queries information about a specific validator.

```solidity
function validator(address validatorAddress) external view returns (Validator memory)
```

### validators
Queries all validators with optional status filtering and pagination.

```solidity
function validators(
    string memory status,
    PageRequest memory pagination
) external view returns (Validator[] memory, PageResponse memory)
```

**Parameters:**
- `status`: Filter by bond status ("BOND_STATUS_BONDED", "BOND_STATUS_UNBONDED", "BOND_STATUS_UNBONDING")

### redelegation
Queries redelegation information.

```solidity
function redelegation(
    address delegatorAddress,
    string memory srcValidatorAddress,
    string memory dstValidatorAddress
) external view returns (RedelegationOutput memory)
```

### redelegations
Queries multiple redelegations with pagination.

```solidity
function redelegations(
    address delegatorAddress,
    string memory srcValidatorAddress,
    string memory dstValidatorAddress,
    PageRequest memory pagination
) external view returns (RedelegationResponse[] memory, PageResponse memory)
```

## Data Structures

### Description
Validator description information.

```solidity
struct Description {
    string moniker;         // Validator name
    string identity;        // Identity signature (Keybase)
    string website;         // Website URL
    string securityContact; // Security contact email
    string details;         // Additional details
}
```

### CommissionRates
Validator commission configuration.

```solidity
struct CommissionRates {
    uint256 rate;          // Current commission rate (0-100%)
    uint256 maxRate;       // Maximum commission rate
    uint256 maxChangeRate; // Maximum daily commission change rate
}
```

### Validator
Complete validator information.

```solidity
struct Validator {
    string operatorAddress;      // Validator operator address
    string consensusPubkey;      // Consensus public key
    bool jailed;                 // Jailed status
    BondStatus status;           // Bond status
    uint256 tokens;              // Total bonded tokens
    uint256 delegatorShares;     // Total delegator shares
    Description description;     // Validator description
    int64 unbondingHeight;       // Unbonding start height
    int64 unbondingTime;         // Unbonding completion time
    CommissionRates commission;  // Commission rates
    uint256 minSelfDelegation;   // Minimum self-delegation
}
```

### BondStatus
Validator bond status enumeration.

```solidity
enum BondStatus {
    Unspecified,  // 0
    Unbonded,     // 1
    Unbonding,    // 2
    Bonded        // 3
}
```

### UnbondingDelegationOutput
Unbonding delegation information.

```solidity
struct UnbondingDelegationOutput {
    UnbondingDelegationEntry[] entries;
}

struct UnbondingDelegationEntry {
    int64 creationHeight;    // Block height when unbonding started
    int64 completionTime;    // When tokens become available
    uint256 initialBalance;  // Original unbonding amount
    uint256 balance;         // Current unbonding amount
    uint64 unbondingId;      // Unique unbonding ID
}
```

## Usage Examples

### Creating a Validator
```solidity
contract ValidatorManager {
    address constant STAKING_PRECOMPILE = 0x0000000000000000000000000000000000000800;
    
    function createNewValidator(
        string memory moniker,
        string memory website,
        string memory pubkey
    ) external payable {
        Description memory desc = Description({
            moniker: moniker,
            identity: "",
            website: website,
            securityContact: "",
            details: ""
        });
        
        CommissionRates memory rates = CommissionRates({
            rate: 5000000000000000000,      // 5%
            maxRate: 10000000000000000000,   // 10%
            maxChangeRate: 1000000000000000000 // 1%
        });
        
        IStaking(STAKING_PRECOMPILE).createValidator(
            desc,
            rates,
            1000000000000000000000, // 1000 tokens minimum self-delegation
            msg.sender,
            pubkey,
            msg.value
        );
    }
}
```

### Delegation Management
```solidity
contract DelegationPool {
    address constant STAKING_PRECOMPILE = 0x0000000000000000000000000000000000000800;
    
    mapping(address => uint256) public userShares;
    uint256 public totalShares;
    string public targetValidator;
    
    function deposit() external payable {
        require(msg.value > 0, "Must send tokens");
        
        // Delegate to target validator
        IStaking(STAKING_PRECOMPILE).delegate(
            address(this),
            targetValidator,
            msg.value
        );
        
        // Calculate shares
        uint256 shares = totalShares == 0 ? msg.value : (msg.value * totalShares) / getTotalDelegated();
        userShares[msg.sender] += shares;
        totalShares += shares;
    }
    
    function withdraw(uint256 shares) external {
        require(userShares[msg.sender] >= shares, "Insufficient shares");
        
        uint256 amount = (shares * getTotalDelegated()) / totalShares;
        
        // Undelegate tokens
        IStaking(STAKING_PRECOMPILE).undelegate(
            address(this),
            targetValidator,
            amount
        );
        
        userShares[msg.sender] -= shares;
        totalShares -= shares;
    }
    
    function getTotalDelegated() public view returns (uint256) {
        (, Coin memory balance) = IStaking(STAKING_PRECOMPILE).delegation(
            address(this),
            targetValidator
        );
        return balance.amount;
    }
}
```

### Validator Status Monitor
```solidity
contract ValidatorMonitor {
    address constant STAKING_PRECOMPILE = 0x0000000000000000000000000000000000000800;
    
    function getActiveValidators() external view returns (Validator[] memory) {
        PageRequest memory page = PageRequest({
            key: "",
            offset: 0,
            limit: 100,
            countTotal: false,
            reverse: false
        });
        
        (Validator[] memory validators,) = IStaking(STAKING_PRECOMPILE).validators(
            "BOND_STATUS_BONDED",
            page
        );
        
        return validators;
    }
    
    function getValidatorAPR(address validatorAddress) external view returns (uint256) {
        Validator memory val = IStaking(STAKING_PRECOMPILE).validator(validatorAddress);
        
        // Calculate APR based on commission and total staked
        // This is a simplified calculation
        uint256 baseAPR = 10000; // 10% base APR
        uint256 commission = val.commission.rate;
        return baseAPR - (baseAPR * commission / 1e18);
    }
}
```

## Gas Costs and Optimization

### Transaction Gas Costs
- `createValidator`: ~200,000 gas
- `editValidator`: ~100,000 gas
- `delegate`: ~150,000 gas
- `undelegate`: ~150,000 gas
- `redelegate`: ~200,000 gas
- `cancelUnbondingDelegation`: ~150,000 gas

### Query Gas Costs
- Single validator query: ~5,000 gas
- Delegation query: ~3,000 gas
- Paginated queries: varies by page size

### Optimization Tips
1. **Batch Operations**: Combine multiple delegations when possible
2. **Query Caching**: Cache validator data to reduce repeated queries
3. **Selective Queries**: Use specific queries rather than broad listing
4. **Pagination**: Use reasonable page sizes for validator lists

## Security Considerations

1. **Authorization**: Most operations require msg.sender to be the delegator
2. **Validator Verification**: Always verify validator addresses exist and are active
3. **Amount Validation**: Ensure delegation amounts don't exceed available balance
4. **Unbonding Period**: Consider 21-day unbonding period in application logic
5. **Commission Changes**: Monitor validator commission changes
6. **Slashing Risk**: Understand that delegated tokens can be slashed

## Integration with Other Precompiles

### With Distribution Precompile
```solidity
// Claim rewards before undelegating
IDistribution(DISTRIBUTION_PRECOMPILE).withdrawDelegatorRewards(msg.sender, validatorAddress);
IStaking(STAKING_PRECOMPILE).undelegate(msg.sender, validatorAddress, amount);
```

### With Bank Precompile
```solidity
// Check available balance before delegating
Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(msg.sender);
uint256 availableAmount = balances[0].amount;
if (availableAmount >= delegationAmount) {
    IStaking(STAKING_PRECOMPILE).delegate(msg.sender, validator, delegationAmount);
}
```

This precompile provides comprehensive staking functionality for building DeFi protocols, delegation pools, and validator management systems on top of Cosmos SDK staking.