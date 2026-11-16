// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Behavioural stand-ins for one TapeOut processor, mirroring the mainnet-verified rules
///      Lineage depends on: exact tapeout fee, NAND burned per gate, "future signal" check,
///      mint = amount * price + flat protocol fee, and safe-mint receiver callbacks.

interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
}

interface IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

contract MockTransistors {
    uint256 public mintPrice;
    uint256 public protocolFee;
    address public circuits;
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    constructor(uint256 mintPrice_, uint256 protocolFee_) {
        mintPrice = mintPrice_;
        protocolFee = protocolFee_;
        circuits = address(new MockCircuits(address(this)));
    }

    function setFees(uint256 mintPrice_, uint256 protocolFee_) external {
        mintPrice = mintPrice_;
        protocolFee = protocolFee_;
    }

    /// @dev The real (post-upgrade) mint charges BEM; the mock mints for free.
    function mint(uint256 id, uint256 amount) external {
        require(id <= 1, "bad id");
        require(amount > 0, "zero");
        balanceOf[msg.sender][id] += amount;
        _checkReceiver(msg.sender, id, amount);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(msg.sender == from, "not approved");
        require(balanceOf[from][id] >= amount, "ERC1155InsufficientBalance");
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
        _checkReceiver(to, id, amount);
    }

    function _checkReceiver(address to, uint256 id, uint256 amount) private {
        if (to.code.length == 0) return;
        require(
            IERC1155Receiver(to).onERC1155Received(msg.sender, address(0), id, amount, "") == IERC1155Receiver.onERC1155Received.selector,
            "ERC1155InvalidReceiver"
        );
    }

    function burnFrom(address from, uint256 id, uint256 amount) external {
        require(msg.sender == circuits, "only circuits");
        require(balanceOf[from][id] >= amount, "ERC1155InsufficientBalance");
        balanceOf[from][id] -= amount;
    }
}

contract MockCircuits {
    uint256 public constant TAPEOUT_FEE = 0.0013 ether;
    address public immutable transistors;
    uint256 public nextId;

    struct Info {
        uint32 nIn;
        uint32 nOut;
        uint32 gates;
        bytes netlist;
    }

    mapping(uint256 => Info) private _info;
    mapping(uint256 => address) public ownerOf;

    event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState);

    constructor(address transistors_) {
        transistors = transistors_;
    }

    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256 id) {
        require(msg.value == TAPEOUT_FEE, "tapeout fee");
        require(nOut > 0, "no outputs");
        uint256 gates = nl.length / 7;
        require(nl.length % 7 == 0, "truncated");
        require(gates >= nOut, "too few signals for outputs");
        for (uint256 i = 0; i < gates; i++) {
            uint256 o = i * 7;
            require(nl[o] == 0x00, "mock: NAND only");
            uint256 self = 2 + nIn + i;
            require(_u24(nl, o + 1) < self && _u24(nl, o + 4) < self, "NAND: future signal");
        }
        MockTransistors(transistors).burnFrom(msg.sender, 0, gates);

        id = ++nextId;
        _info[id] = Info(nIn, nOut, uint32(gates), nl);
        ownerOf[id] = msg.sender;
        if (msg.sender.code.length > 0) {
            require(
                IERC721Receiver(msg.sender).onERC721Received(msg.sender, address(0), id, "") == IERC721Receiver.onERC721Received.selector,
                "ERC721InvalidReceiver"
            );
        }
        emit TapedOut(id, msg.sender, uint32(gates), 0);
    }

    function circuitInfo(uint256 id) external view returns (uint32, uint32, uint32, uint32) {
        Info storage i = _info[id];
        require(i.nOut > 0, "no circuit");
        return (i.nIn, i.nOut, 0, i.gates);
    }

    function netlist(uint256 id) external view returns (bytes memory) {
        require(_info[id].nOut > 0, "no circuit");
        return _info[id].netlist;
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(ownerOf[id] == from, "not owner");
        require(msg.sender == from, "not approved");
        ownerOf[id] = to;
    }

    function _u24(bytes calldata b, uint256 at) private pure returns (uint256) {
        return (uint256(uint8(b[at])) << 16) | (uint256(uint8(b[at + 1])) << 8) | uint256(uint8(b[at + 2]));
    }
}
