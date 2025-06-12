# Proxy Patterns and Upgradeable Contracts

This document provides a comprehensive guide to implementing proxy patterns for upgradeable smart contracts, based on our real-world implementation experience.

## Table of Contents

1. [Understanding Proxy Patterns](#understanding-proxy-patterns)
2. [Implementation Details](#implementation-details)
3. [Upgrade Process](#upgrade-process)
4. [Storage Layout Considerations](#storage-layout-considerations)
5. [Security Considerations](#security-considerations)
6. [Common Pitfalls](#common-pitfalls)
7. [Testing Strategies](#testing-strategies)

## Understanding Proxy Patterns

### What is a Proxy Pattern?

A proxy pattern in smart contracts allows you to upgrade contract logic while preserving:
- Contract address
- Contract state/storage
- User interactions and integrations

### Why Use Proxy Patterns?

**Traditional Problem**: Smart contracts are immutable once deployed
**Solution**: Separate logic (implementation) from state (proxy)

```
User → Proxy Contract → Implementation Contract
       (Storage)        (Logic)
```

### Types of Proxy Patterns

1. **Simple Proxy**: Basic delegatecall pattern
2. **Transparent Proxy**: Admin/user function separation
3. **UUPS (Universal Upgradeable Proxy Standard)**: Upgrade logic in implementation
4. **Beacon Proxy**: Multiple proxies pointing to same implementation

## Implementation Details

### Our Simple Proxy Implementation

```solidity
// contracts/utils/MultiSendProxy.sol
pragma solidity ^0.8.19;

contract MultiSendProxy {
    // Storage slots
    address public implementation;  // Slot 0
    address public admin;          // Slot 1

    event ImplementationUpgraded(address indexed oldImplementation, address indexed newImplementation);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "MultiSendProxy: caller is not the admin");
        _;
    }

    constructor(address _implementation) {
        implementation = _implementation;
        admin = msg.sender;
    }

    function upgrade(address newImplementation) external onlyAdmin {
        require(newImplementation != address(0), "MultiSendProxy: new implementation is the zero address");
        require(newImplementation != implementation, "MultiSendProxy: new implementation is the same as current");

        address oldImplementation = implementation;
        implementation = newImplementation;

        emit ImplementationUpgraded(oldImplementation, newImplementation);
    }

    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "MultiSendProxy: new admin is the zero address");

        address oldAdmin = admin;
        admin = newAdmin;

        emit AdminChanged(oldAdmin, newAdmin);
    }

    fallback() external payable {
        address impl = implementation;
        assembly {
            // Copy call data to memory
            calldatacopy(0, 0, calldatasize())

            // Delegate call to implementation
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)

            // Copy return data to memory
            returndatacopy(0, 0, returndatasize())

            // Return or revert based on result
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {
        // Forward ETH to implementation if needed
    }
}
```

### Key Concepts Explained

#### 1. Delegatecall Mechanism

```solidity
// When user calls proxy.someFunction()
// Proxy executes: delegatecall(implementation, calldata)
// Result: Implementation code runs in proxy's context

// Context preservation:
// - msg.sender: Original caller
// - msg.value: Original value
// - Storage: Proxy's storage
// - Address: Proxy's address
```

#### 2. Storage Layout

**Critical Rule**: Storage layout must be compatible between versions

```solidity
// ✅ CORRECT: Adding new variables at the end
contract V1 {
    address public owner;     // Slot 0
    uint256 public value;     // Slot 1
}

contract V2 {
    address public owner;     // Slot 0 - SAME
    uint256 public value;     // Slot 1 - SAME
    bool public newFlag;      // Slot 2 - NEW
}

// ❌ INCORRECT: Changing existing variables
contract V1 {
    address public owner;     // Slot 0
    uint256 public value;     // Slot 1
}

contract V2 {
    uint256 public value;     // Slot 0 - WRONG!
    address public owner;     // Slot 1 - WRONG!
}
```

## Upgrade Process

### Our Implementation Journey

#### Step 1: Original Contract (V1)
```solidity
contract MultiSend {
    address public owner;

    constructor() {
        owner = msg.sender;  // ❌ Problem: Constructor won't work with proxy
    }

    function multiSend(address recipient, TokenTransfer[] memory transfers) external {
        for (uint i = 0; i < transfers.length; i++) {
            // ❌ Problem: Uses transfer() - requires tokens in contract
            IERC20(transfers[i].token).transfer(recipient, transfers[i].amount);
        }
    }
}
```

#### Step 2: Upgradeable Version (V2)
```solidity
contract MultiSendV2 {
    address public owner;
    bool public initialized;

    // ✅ Solution: Use initializer instead of constructor
    function initialize(address _owner) external {
        require(!initialized, "Already initialized");
        owner = _owner;
        initialized = true;
    }

    function multiSend(address recipient, TokenTransfer[] memory transfers) external {
        for (uint i = 0; i < transfers.length; i++) {
            // ✅ Solution: Uses transferFrom() with allowances
            IERC20(transfers[i].token).transferFrom(owner, recipient, transfers[i].amount);
        }
    }
}
```

#### Step 3: Deployment Script
```solidity
contract UpgradeMultiSendScript is Script {
    address constant CURRENT_MULTISEND = 0xa41dd39233852D9fcc4441eB9Aa3901Df5f67EC4;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deployer:", deployer);
        console.log("Current MultiSend:", CURRENT_MULTISEND);

        // Step 1: Deploy new implementation
        MultiSendV2 multiSendV2 = new MultiSendV2();
        console.log("MultiSendV2 implementation deployed to:", address(multiSendV2));

        // Step 2: Deploy proxy pointing to current contract
        MultiSendProxy proxy = new MultiSendProxy(CURRENT_MULTISEND);
        console.log("Proxy deployed to:", address(proxy));

        // Step 3: Upgrade proxy to new implementation
        proxy.upgrade(address(multiSendV2));
        console.log("Proxy upgraded to MultiSendV2");

        // Step 4: Initialize new implementation
        MultiSendV2(address(proxy)).initialize(deployer);
        console.log("MultiSendV2 initialized with owner:", deployer);

        vm.stopBroadcast();
    }
}
```

### Upgrade Execution

```bash
# Deploy the upgrade
forge script script/UpgradeMultiSend.s.sol \
  --rpc-url https://cevm-01-evmrpc.dev.skip.build \
  --broadcast \
  --verify

# Expected output:
# MultiSendV2 implementation deployed to: 0x...
# Proxy deployed to: 0x...
# Proxy upgraded to MultiSendV2
# MultiSendV2 initialized with owner: 0x...
```

## Storage Layout Considerations

### Understanding Storage Slots

```solidity
contract StorageExample {
    uint256 public a;        // Slot 0
    uint256 public b;        // Slot 1
    address public c;        // Slot 2 (20 bytes)
    bool public d;           // Slot 2 (1 byte) - packed with address
    uint128 public e;        // Slot 3 (16 bytes)
    uint128 public f;        // Slot 3 (16 bytes) - packed with e
}
```

### Safe Upgrade Patterns

#### ✅ Safe: Adding New Variables
```solidity
// V1
contract Implementation {
    address public owner;
    uint256 public value;
}

// V2 - Safe upgrade
contract ImplementationV2 {
    address public owner;    // Slot 0 - unchanged
    uint256 public value;    // Slot 1 - unchanged
    bool public newFlag;     // Slot 2 - new
    uint256 public newValue; // Slot 3 - new
}
```

#### ❌ Unsafe: Changing Existing Variables
```solidity
// V1
contract Implementation {
    address public owner;
    uint256 public value;
}

// V2 - Unsafe upgrade
contract ImplementationV2 {
    uint256 public value;    // ❌ Now in slot 0, was slot 1
    address public owner;    // ❌ Now in slot 1, was slot 0
}
```

### Storage Gaps for Future Upgrades

```solidity
contract UpgradeableContract {
    address public owner;
    uint256 public value;

    // Reserve storage slots for future upgrades
    uint256[48] private __gap;  // 50 total slots - 2 used = 48 gap
}
```

## Security Considerations

### 1. Admin Key Management

```solidity
// ✅ Good: Multi-sig admin
contract SecureProxy {
    address public admin;  // Should be multi-sig wallet

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }
}

// ❌ Bad: EOA admin
// Single private key controls entire system
```

### 2. Initialization Security

```solidity
contract SecureImplementation {
    bool private initialized;

    function initialize(address _owner) external {
        require(!initialized, "Already initialized");
        require(_owner != address(0), "Invalid owner");

        owner = _owner;
        initialized = true;
    }

    // ✅ Prevent re-initialization
    modifier onlyInitialized() {
        require(initialized, "Not initialized");
        _;
    }
}
```

### 3. Function Selector Collisions

```solidity
// ⚠️ Warning: Avoid function selector collisions between proxy and implementation

// Proxy functions (admin only):
// - upgrade(address)
// - changeAdmin(address)

// Implementation functions:
// - Should not have same selectors as proxy admin functions
```

## Common Pitfalls

### 1. Constructor Usage in Implementation

```solidity
// ❌ Wrong: Constructor won't be called via proxy
contract BadImplementation {
    address public owner;

    constructor() {
        owner = msg.sender;  // This won't work!
    }
}

// ✅ Correct: Use initializer
contract GoodImplementation {
    address public owner;
    bool private initialized;

    function initialize() external {
        require(!initialized, "Already initialized");
        owner = msg.sender;
        initialized = true;
    }
}
```

### 2. Storage Layout Violations

```solidity
// ❌ Wrong: Changing storage layout
contract V1 {
    uint256 public a;
    uint256 public b;
}

contract V2 {
    uint256 public b;  // ❌ Now in wrong slot!
    uint256 public a;  // ❌ Now in wrong slot!
}

// ✅ Correct: Preserving layout
contract V2 {
    uint256 public a;  // ✅ Same slot
    uint256 public b;  // ✅ Same slot
    uint256 public c;  // ✅ New slot
}
```

### 3. Uninitialized Implementation

```solidity
// ❌ Wrong: Forgetting to initialize after upgrade
proxy.upgrade(newImplementation);
// Missing: initialize call!

// ✅ Correct: Always initialize after upgrade
proxy.upgrade(newImplementation);
ImplementationV2(address(proxy)).initialize(owner);
```

## Testing Strategies

### 1. Storage Layout Tests

```solidity
contract StorageLayoutTest is Test {
    function testStorageLayout() public {
        // Deploy V1
        ImplementationV1 v1 = new ImplementationV1();

        // Set values
        v1.setOwner(address(0x123));
        v1.setValue(456);

        // Deploy proxy
        Proxy proxy = new Proxy(address(v1));

        // Verify values through proxy
        assertEq(ImplementationV1(address(proxy)).owner(), address(0x123));
        assertEq(ImplementationV1(address(proxy)).value(), 456);

        // Deploy V2
        ImplementationV2 v2 = new ImplementationV2();

        // Upgrade
        proxy.upgrade(address(v2));

        // Verify old values preserved
        assertEq(ImplementationV2(address(proxy)).owner(), address(0x123));
        assertEq(ImplementationV2(address(proxy)).value(), 456);
    }
}
```

### 2. Upgrade Process Tests

```solidity
contract UpgradeTest is Test {
    function testUpgradeProcess() public {
        // Test complete upgrade flow
        // 1. Deploy V1
        // 2. Deploy proxy
        // 3. Use V1 through proxy
        // 4. Deploy V2
        // 5. Upgrade proxy
        // 6. Initialize V2
        // 7. Verify functionality
    }
}
```

### 3. Security Tests

```solidity
contract SecurityTest is Test {
    function testOnlyAdminCanUpgrade() public {
        // Verify non-admin cannot upgrade
        vm.prank(address(0x999));
        vm.expectRevert("Not admin");
        proxy.upgrade(newImplementation);
    }

    function testCannotReinitialize() public {
        // Verify cannot initialize twice
        implementation.initialize(owner);

        vm.expectRevert("Already initialized");
        implementation.initialize(owner);
    }
}
```

## Best Practices Summary

1. **Always use initializers** instead of constructors
2. **Preserve storage layout** between upgrades
3. **Use storage gaps** for future flexibility
4. **Secure admin keys** with multi-sig wallets
5. **Test thoroughly** before production upgrades
6. **Document storage layout** for future developers
7. **Implement proper access controls** for upgrade functions
8. **Verify initialization** after each upgrade

This proxy pattern implementation provides a robust foundation for upgradeable smart contracts while maintaining security and flexibility.