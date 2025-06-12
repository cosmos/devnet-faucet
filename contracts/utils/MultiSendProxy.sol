// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MultiSendProxy {
    address public implementation;
    address public admin;

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

    /**
     * @dev Upgrade the implementation contract
     * @param newImplementation Address of the new implementation contract
     */
    function upgrade(address newImplementation) external onlyAdmin {
        require(newImplementation != address(0), "MultiSendProxy: new implementation cannot be zero address");
        require(newImplementation != implementation, "MultiSendProxy: new implementation is the same as current");

        address oldImplementation = implementation;
        implementation = newImplementation;

        emit ImplementationUpgraded(oldImplementation, newImplementation);
    }

    /**
     * @dev Change the admin of the proxy
     * @param newAdmin Address of the new admin
     */
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "MultiSendProxy: new admin cannot be zero address");

        address oldAdmin = admin;
        admin = newAdmin;

        emit AdminChanged(oldAdmin, newAdmin);
    }

    /**
     * @dev Fallback function that delegates calls to the current implementation
     */
    fallback() external payable {
        address impl = implementation;
        require(impl != address(0), "MultiSendProxy: implementation not set");

        assembly {
            // Copy msg.data to memory
            calldatacopy(0, 0, calldatasize())

            // Delegate call to the implementation
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)

            // Copy the returned data
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 {
                // Delegatecall failed, revert with returned data
                revert(0, returndatasize())
            }
            default {
                // Delegatecall succeeded, return the data
                return(0, returndatasize())
            }
        }
    }

    /**
     * @dev Receive function to accept native token deposits
     */
    receive() external payable {
        // Delegate to fallback
        fallback();
    }
}