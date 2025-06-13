# ERC20 Precompile Documentation

## Overview
The ERC20 precompiles provide standard ERC20 token functionality for native Cosmos tokens that have been registered for EVM compatibility. Each registered token pair gets its own precompile contract address.

**Precompile Addresses**: Dynamic (assigned per token pair registration)

## Interfaces

The ERC20 precompiles implement multiple standard interfaces:

### IERC20
Core ERC20 functionality.

### IERC20Metadata
ERC20 metadata extension.

### IERC20MetadataAllowance
Enhanced allowance functionality.

## Standard ERC20 Methods

### totalSupply
Returns the total token supply.

```solidity
function totalSupply() external view returns (uint256)
```

**Returns:**
- `uint256`: Total supply in smallest unit (18 decimals)

### balanceOf
Returns the token balance of an account.

```solidity
function balanceOf(address account) external view returns (uint256)
```

**Parameters:**
- `account`: Address to query balance for

**Returns:**
- `uint256`: Token balance in smallest unit

### transfer
Transfers tokens to a recipient.

```solidity
function transfer(address to, uint256 amount) external returns (bool)
```

**Parameters:**
- `to`: Recipient address
- `amount`: Amount to transfer

**Returns:**
- `bool`: Success status

**Event:**
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```

### allowance
Returns the allowance granted by owner to spender.

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

**Parameters:**
- `owner`: Token owner address
- `spender`: Address authorized to spend

**Returns:**
- `uint256`: Allowance amount

### approve
Approves a spender to transfer tokens on behalf of the caller.

```solidity
function approve(address spender, uint256 amount) external returns (bool)
```

**Parameters:**
- `spender`: Address to authorize
- `amount`: Maximum amount to authorize

**Returns:**
- `bool`: Success status

**Event:**
```solidity
event Approval(address indexed owner, address indexed spender, uint256 value);
```

### transferFrom
Transfers tokens from one account to another using allowance.

```solidity
function transferFrom(address from, address to, uint256 amount) external returns (bool)
```

**Parameters:**
- `from`: Source address (must have approved caller)
- `to`: Recipient address
- `amount`: Amount to transfer

**Returns:**
- `bool`: Success status

**Event:**
```solidity
event Transfer(address indexed from, address indexed to, uint256 value);
```

## ERC20 Metadata Methods

### name
Returns the token name.

```solidity
function name() external view returns (string memory)
```

**Returns:**
- `string`: Human-readable token name

### symbol
Returns the token symbol.

```solidity
function symbol() external view returns (string memory)
```

**Returns:**
- `string`: Token symbol (typically 3-4 characters)

### decimals
Returns the number of decimals.

```solidity
function decimals() external view returns (uint8)
```

**Returns:**
- `uint8`: Number of decimals (always 18 for EVM compatibility)

## Enhanced Allowance Methods

### increaseAllowance
Increases the allowance granted to a spender.

```solidity
function increaseAllowance(address spender, uint256 addedValue) external returns (bool)
```

**Parameters:**
- `spender`: Address to increase allowance for
- `addedValue`: Amount to add to current allowance

**Returns:**
- `bool`: Success status

**Benefits:**
- Prevents front-running attacks
- Safer than direct `approve` for modifications

### decreaseAllowance
Decreases the allowance granted to a spender.

```solidity
function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool)
```

**Parameters:**
- `spender`: Address to decrease allowance for
- `subtractedValue`: Amount to subtract from current allowance

**Returns:**
- `bool`: Success status

**Safety:**
- Reverts if subtraction would result in underflow

## Usage Examples

### Basic Token Operations
```solidity
contract TokenManager {
    IERC20 public token;
    
    constructor(address tokenAddress) {
        token = IERC20(tokenAddress);
    }
    
    function getTokenInfo() external view returns (
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply
    ) {
        IERC20Metadata metadata = IERC20Metadata(address(token));
        name = metadata.name();
        symbol = metadata.symbol();
        decimals = metadata.decimals();
        totalSupply = token.totalSupply();
    }
    
    function transferTokens(address to, uint256 amount) external {
        require(token.transfer(to, amount), "Transfer failed");
    }
    
    function checkBalance(address account) external view returns (uint256) {
        return token.balanceOf(account);
    }
}
```

### Safe Allowance Management
```solidity
contract SafeAllowanceManager {
    IERC20MetadataAllowance public token;
    
    constructor(address tokenAddress) {
        token = IERC20MetadataAllowance(tokenAddress);
    }
    
    function safeApprove(address spender, uint256 amount) external {
        // Reset allowance to 0 first to prevent front-running
        uint256 currentAllowance = token.allowance(msg.sender, spender);
        if (currentAllowance > 0) {
            require(token.approve(spender, 0), "Reset approval failed");
        }
        require(token.approve(spender, amount), "Approval failed");
    }
    
    function safeIncreaseAllowance(address spender, uint256 increment) external {
        require(
            token.increaseAllowance(spender, increment),
            "Increase allowance failed"
        );
    }
    
    function safeDecreaseAllowance(address spender, uint256 decrement) external {
        uint256 currentAllowance = token.allowance(msg.sender, spender);
        require(currentAllowance >= decrement, "Insufficient allowance");
        
        require(
            token.decreaseAllowance(spender, decrement),
            "Decrease allowance failed"
        );
    }
}
```

### Token Swap Contract
```solidity
contract TokenSwap {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public rate; // tokenA per tokenB (scaled by 1e18)
    
    constructor(address _tokenA, address _tokenB, uint256 _rate) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        rate = _rate;
    }
    
    function swapAtoB(uint256 amountA) external {
        uint256 amountB = (amountA * 1e18) / rate;
        
        require(
            tokenA.transferFrom(msg.sender, address(this), amountA),
            "TokenA transfer failed"
        );
        
        require(
            tokenB.transfer(msg.sender, amountB),
            "TokenB transfer failed"
        );
        
        emit Swap(msg.sender, address(tokenA), address(tokenB), amountA, amountB);
    }
    
    function swapBtoA(uint256 amountB) external {
        uint256 amountA = (amountB * rate) / 1e18;
        
        require(
            tokenB.transferFrom(msg.sender, address(this), amountB),
            "TokenB transfer failed"
        );
        
        require(
            tokenA.transfer(msg.sender, amountA),
            "TokenA transfer failed"
        );
        
        emit Swap(msg.sender, address(tokenB), address(tokenA), amountB, amountA);
    }
    
    event Swap(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
}
```

### Liquidity Pool
```solidity
contract LiquidityPool {
    IERC20 public tokenA;
    IERC20 public tokenB;
    
    uint256 public reserveA;
    uint256 public reserveB;
    
    mapping(address => uint256) public liquidity;
    uint256 public totalLiquidity;
    
    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }
    
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "Invalid amounts");
        
        // Transfer tokens to pool
        require(
            tokenA.transferFrom(msg.sender, address(this), amountA),
            "TokenA transfer failed"
        );
        require(
            tokenB.transferFrom(msg.sender, address(this), amountB),
            "TokenB transfer failed"
        );
        
        // Calculate liquidity shares
        uint256 liquidityMinted;
        if (totalLiquidity == 0) {
            liquidityMinted = sqrt(amountA * amountB);
        } else {
            liquidityMinted = min(
                (amountA * totalLiquidity) / reserveA,
                (amountB * totalLiquidity) / reserveB
            );
        }
        
        liquidity[msg.sender] += liquidityMinted;
        totalLiquidity += liquidityMinted;
        
        reserveA += amountA;
        reserveB += amountB;
        
        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }
    
    function removeLiquidity(uint256 liquidityAmount) external {
        require(liquidity[msg.sender] >= liquidityAmount, "Insufficient liquidity");
        
        uint256 amountA = (liquidityAmount * reserveA) / totalLiquidity;
        uint256 amountB = (liquidityAmount * reserveB) / totalLiquidity;
        
        liquidity[msg.sender] -= liquidityAmount;
        totalLiquidity -= liquidityAmount;
        
        reserveA -= amountA;
        reserveB -= amountB;
        
        require(tokenA.transfer(msg.sender, amountA), "TokenA transfer failed");
        require(tokenB.transfer(msg.sender, amountB), "TokenB transfer failed");
        
        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }
    
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
    
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity);
}
```

## Gas Costs

### Standard Operations
- `transfer`: ~21,000 gas
- `transferFrom`: ~25,000 gas
- `approve`: ~20,000 gas
- `increaseAllowance`: ~22,000 gas
- `decreaseAllowance`: ~22,000 gas

### View Operations
- `balanceOf`: ~2,000 gas
- `allowance`: ~2,000 gas
- `totalSupply`: ~2,000 gas
- `name/symbol/decimals`: ~2,000 gas each

## Security Considerations

### Allowance Best Practices
1. **Front-running Protection**: Use `increaseAllowance`/`decreaseAllowance` instead of direct `approve`
2. **Zero Allowance**: Reset allowance to 0 before setting new value
3. **Allowance Checks**: Always check return values of allowance operations

### Transfer Safety
1. **Return Value Checks**: Always check return values of transfer operations
2. **Reentrancy Protection**: Use checks-effects-interactions pattern
3. **Balance Validation**: Verify sufficient balance before transfers

### Input Validation
1. **Address Validation**: Check for zero addresses where inappropriate
2. **Amount Validation**: Ensure amounts are reasonable and non-zero where required
3. **Overflow Protection**: Use SafeMath or Solidity 0.8+ built-in protection

## Error Conditions

Common revert reasons:
- `"ERC20: transfer amount exceeds balance"`
- `"ERC20: transfer to the zero address"`
- `"ERC20: approve to the zero address"`
- `"ERC20: transfer amount exceeds allowance"`
- `"ERC20: decreased allowance below zero"`

## Integration with Other Precompiles

### With Bank Precompile
```solidity
// Check both ERC20 and native balances
uint256 erc20Balance = IERC20(tokenAddress).balanceOf(user);
Balance[] memory nativeBalances = IBank(BANK_PRECOMPILE).balances(user);
```

### With Distribution Precompile
```solidity
// Auto-convert rewards to ERC20 tokens
Coin[] memory rewards = IDistribution(DISTRIBUTION_PRECOMPILE)
    .withdrawDelegatorRewards(user, validator);

// Rewards automatically appear as ERC20 balance if token pair exists
uint256 erc20Balance = IERC20(rewardTokenAddress).balanceOf(user);
```

This precompile provides full ERC20 compatibility for native Cosmos tokens, enabling seamless integration with DeFi protocols, DEXes, and other Ethereum-compatible applications.
