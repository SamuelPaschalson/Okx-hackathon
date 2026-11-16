// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal TapeOut interfaces (X Layer, chain 196). Only what Lineage calls.
/// @dev Signatures as verified on mainnet forks by the Cerebr team (TAPEOUT.md in
///      github.com/NetLayerLabs/Cerebr). TapeOut's contracts are upgradeable and
///      unaudited: fees are read live, never hard-coded.

interface ITapeOutFactory {
    event CPUCreated(
        address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice
    );

    /// @dev Since the late-2026 factory upgrade this is NONPAYABLE: the deploy fee is
    ///      `deployFee()` BEM (8 decimals), pulled with transferFrom. Approve the factory first.
    function createCPU(string calldata name, string calldata symbol, string calldata story, uint256 transistorSupply, uint256 mintPrice)
        external
        returns (address transistors, address circuits);

    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
}

interface IERC20Minimal {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice One processor's transistor supply (ERC-1155; NAND = 0, LATCH = 1).
interface ITapeOutTransistors {
    /// @dev On CPUs created after the late-2026 upgrade this is nonpayable and charges
    ///      amount * mintPrice + protocolFee in BEM (transferFrom). Approve the transistors contract first.
    function mint(uint256 id, uint256 amount) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
    function mintPrice() external view returns (uint256);
    function protocolFee() external view returns (uint256);
    function circuits() external view returns (address);
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/// @notice One processor's taped-out circuits (ERC-721, ids start at 1).
interface ITapeOutCircuits {
    event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState);

    /// @dev msg.value must equal TAPEOUT_FEE exactly. Burns one NAND per NAND element from msg.sender.
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256);
    function TAPEOUT_FEE() external view returns (uint256);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function netlist(uint256 id) external view returns (bytes memory);
    /// @dev Bit-packed LSB-first.
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function ownerOf(uint256 id) external view returns (address);
    function transistors() external view returns (address);
    function transferFrom(address from, address to, uint256 id) external;
}
