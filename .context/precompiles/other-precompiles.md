# Remaining Precompiles Documentation

## Bech32 Precompile (0x400)

**Purpose**: Address format conversion between Ethereum hex and Cosmos bech32.

**Methods:**
- `hexToBech32(address addr, string prefix) → string` - Convert hex to bech32
- `bech32ToHex(string bech32Address) → address` - Convert bech32 to hex

**Usage:**
```solidity
string memory cosmosAddr = IBech32(BECH32_PRECOMPILE).hexToBech32(0x742d35..., "cosmos");
address ethAddr = IBech32(BECH32_PRECOMPILE).bech32ToHex("cosmos1wsk6hv...");
```

## Governance Precompile (0x805)

**Purpose**: Participate in on-chain governance through proposals and voting.

**Key Methods:**
- `submitProposal(address proposer, bytes jsonProposal, Coin[] deposit) → uint64`
- `vote(address voter, uint64 proposalId, VoteOption option, string metadata) → bool`
- `getProposal(uint64 proposalId) → ProposalData`

**Vote Options:** Unspecified, Yes, Abstain, No, NoWithVeto

## ICS20 Transfer Precompile (0x802)

**Purpose**: Cross-chain token transfers via IBC.

**Key Method:**
- `transfer(string sourcePort, string sourceChannel, string denom, uint256 amount, address sender, string receiver, Height timeoutHeight, uint64 timeoutTimestamp, string memo) → uint64`

**Usage:**
```solidity
ICS20I(ICS20_PRECOMPILE).transfer(
    "transfer",
    "channel-0", 
    "uatom",
    1000000,
    msg.sender,
    "cosmos1receiver...",
    Height({revisionNumber: 1, revisionHeight: 1000000}),
    block.timestamp + 3600,
    ""
);
```

## Slashing Precompile (0x806)

**Purpose**: Validator slashing and jail management.

**Methods:**
- `unjail(address validatorAddress) → bool` - Unjail a validator
- `getSigningInfo(address consAddress) → SigningInfo` - Get validator signing info

## Evidence Precompile (0x807)

**Purpose**: Submit and query evidence of validator misbehavior.

**Methods:**
- `submitEvidence(Equivocation evidence) → bool`
- `evidence(bytes evidenceHash) → Equivocation`

## P256 Precompile (0x100)

**Purpose**: P-256 elliptic curve cryptographic operations.

**Note**: This precompile provides cryptographic primitives for P-256 curve operations used in secure communications and digital signatures.

## Callbacks Precompile

**Purpose**: IBC packet lifecycle callbacks.

**Methods:**
- `onPacketAcknowledgement(string channelId, string portId, uint64 sequence, bytes data, bytes acknowledgement)`
- `onPacketTimeout(string channelId, string portId, uint64 sequence, bytes data)`

## WERC20 Precompile

**Purpose**: Wrapped native token functionality (similar to WETH).

**Methods:**
- `deposit()` payable - Wrap native tokens
- `withdraw(uint256 wad)` - Unwrap to native tokens

**Events:**
- `Deposit(address indexed dst, uint256 wad)`
- `Withdrawal(address indexed src, uint256 wad)`

**Usage:**
```solidity
// Wrap native tokens
IWERC20(WERC20_ADDRESS).deposit{value: msg.value}();

// Unwrap tokens
IWERC20(WERC20_ADDRESS).withdraw(amount);
```

## Common Integration Patterns

### Multi-Precompile Workflows
```solidity
contract DeFiIntegration {
    function stakingWorkflow() external payable {
        // 1. Check balances
        Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(msg.sender);
        
        // 2. Delegate tokens
        IStaking(STAKING_PRECOMPILE).delegate(msg.sender, validator, amount);
        
        // 3. Set withdrawal address if needed
        IDistribution(DISTRIBUTION_PRECOMPILE).setWithdrawAddress(msg.sender, withdrawAddr);
        
        // 4. Later: claim rewards
        IDistribution(DISTRIBUTION_PRECOMPILE).claimRewards(msg.sender, 10);
    }
    
    function governanceWorkflow() external {
        // 1. Submit proposal
        uint64 proposalId = IGov(GOV_PRECOMPILE).submitProposal(msg.sender, proposalJson, deposit);
        
        // 2. Vote on proposal
        IGov(GOV_PRECOMPILE).vote(msg.sender, proposalId, VoteOption.Yes, "");
        
        // 3. Check results
        TallyResultData memory result = IGov(GOV_PRECOMPILE).getTallyResult(proposalId);
    }
}
```

### Cross-Chain Integration
```solidity
contract CrossChainDeFi {
    function bridgeAndStake() external {
        // 1. Receive tokens via IBC
        // (triggered by external IBC transfer)
        
        // 2. Convert to ERC20 format
        Balance[] memory balances = IBank(BANK_PRECOMPILE).balances(msg.sender);
        
        // 3. Stake received tokens
        IStaking(STAKING_PRECOMPILE).delegate(msg.sender, validator, balances[0].amount);
        
        // 4. Set up auto-compound
        setupAutoCompound(msg.sender, validator);
    }
}
```


## Best Practices

1. **Authorization**: Always verify msg.sender authorization
2. **Input Validation**: Validate all address and amount parameters
3. **Gas Limits**: Account for variable gas costs with delegation counts
4. **Return Values**: Check all return values from precompile calls
5. **Reentrancy**: Use appropriate reentrancy protection
6. **Address Format**: Properly convert between hex and bech32 addresses
7. **Chain Validation**: Verify chain IDs for cross-chain operations
