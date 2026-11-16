// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ITapeOutCircuits, ITapeOutTransistors} from "./ITapeOut.sol";

/// @title Lineage
/// @notice Breeding registry for creatures whose genome is a NAND netlist taped out on
///         TapeOut. Every creature is a Circuit NFT on the Lineage processor.
///
/// Flow:
///   1. layEgg(parentA, parentB)  -> pays fees, fixes a seed nobody can reroll
///   2. hatch(eggId, netlist)     -> tapes the child out from the contract's NAND stock,
///                                   records its parents, and hands the NFT to the breeder
///
/// NAND stock: since TapeOut's late-2026 upgrade, minting transistors is paid in BEM. The
/// operator mints NAND in bulk and deposits them here, so players only ever pay OKB.
///
/// The child netlist is computed off-chain by `breed(parentA, parentB, seed)` in
/// the lineage core package. Re-running breeding in Solidity would cost far more gas than it is worth,
/// so the contract records (parents, seed) and clients re-derive and flag any mismatch.
contract Lineage {
    // ---------------------------------------------------------------- constants

    uint32 public constant N_IN = 10;
    uint32 public constant N_OUT = 3;
    uint256 public constant MAX_GATES = 64;
    uint256 private constant NAND_ID = 0;
    uint256 private constant NAND_BYTES = 7;

    // ---------------------------------------------------------------- types

    struct Creature {
        uint64 parentA;
        uint64 parentB;
        uint32 generation;
        uint64 eggId; // 0 for founders
        bytes32 seed; // 0 for founders
    }

    struct Egg {
        address breeder;
        uint64 parentA;
        uint64 parentB;
        uint64 hatchedAs; // circuit id, 0 while unhatched
        bytes32 seed;
    }

    /// @notice Everything a client needs to render and verify a creature, in one call.
    struct CreatureView {
        uint256 id;
        address owner;
        uint64 parentA;
        uint64 parentB;
        uint32 generation;
        uint64 eggId;
        bytes32 seed;
        uint256 studFee;
        bytes netlist;
    }

    // ---------------------------------------------------------------- storage

    ITapeOutCircuits public immutable circuits;
    ITapeOutTransistors public immutable transistors;

    address public owner;
    uint256 public breedFee;

    mapping(uint256 circuitId => Creature) private _creatures;
    mapping(uint256 circuitId => bool) public isCreature;
    uint256[] private _creatureIds;

    Egg[] private _eggs; // egg id = index + 1
    mapping(address breeder => uint256[]) private _eggsOf;

    mapping(uint256 circuitId => uint256) public studFee;
    /// @notice Pull-payment balances (stud fees for owners, breed fees for the protocol).
    mapping(address => uint256) public credits;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event EggLaid(uint256 indexed eggId, address indexed breeder, uint256 parentA, uint256 parentB, bytes32 seed);
    event Hatched(uint256 indexed eggId, uint256 indexed circuitId, address indexed breeder, uint32 generation);
    event FounderSeeded(uint256 indexed circuitId);
    event StudFeeSet(uint256 indexed circuitId, uint256 fee);
    event BreedFeeSet(uint256 fee);
    event Withdrawn(address indexed account, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- errors

    error NotOwner();
    error NotCreature(uint256 circuitId);
    error SameParent();
    error WrongPayment(uint256 expected, uint256 sent);
    error NotBreeder();
    error AlreadyHatched();
    error UnknownEgg();
    error BadNetlist();
    error NotCircuitOwner();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();
    error OutOfNand(uint256 needed, uint256 stock);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(ITapeOutTransistors transistors_, uint256 breedFee_) {
        transistors = transistors_;
        circuits = ITapeOutCircuits(transistors_.circuits());
        breedFee = breedFee_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit BreedFeeSet(breedFee_);
    }

    // ---------------------------------------------------------------- breeding

    /// @notice Total cost to lay an egg from these parents, for `breeder`.
    /// Stud fees apply only to parents the breeder does not own.
    function layCost(uint256 parentA, uint256 parentB, address breeder) public view returns (uint256 total) {
        total = breedFee;
        if (circuits.ownerOf(parentA) != breeder) total += studFee[parentA];
        if (circuits.ownerOf(parentB) != breeder) total += studFee[parentB];
    }

    function layEgg(uint256 parentA, uint256 parentB) external payable nonReentrant returns (uint256 eggId) {
        if (!isCreature[parentA]) revert NotCreature(parentA);
        if (!isCreature[parentB]) revert NotCreature(parentB);
        if (parentA == parentB) revert SameParent();

        uint256 cost = layCost(parentA, parentB, msg.sender);
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        _creditStud(parentA);
        _creditStud(parentB);
        credits[owner] += breedFee;

        eggId = _eggs.length + 1;
        // The breeder cannot choose the seed. A sequencer could bias prevrandao, but each
        // attempt costs a full breed fee, which makes grinding uneconomic for a game.
        bytes32 seed =
            keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), parentA, parentB, msg.sender, eggId, block.chainid));
        _eggs.push(Egg({breeder: msg.sender, parentA: uint64(parentA), parentB: uint64(parentB), hatchedAs: 0, seed: seed}));
        _eggsOf[msg.sender].push(eggId);

        emit EggLaid(eggId, msg.sender, parentA, parentB, seed);
    }

    /// @notice Exact msg.value `hatch` needs: TapeOut's tapeout fee, read live.
    function hatchCost() public view returns (uint256) {
        return circuits.TAPEOUT_FEE();
    }

    /// @notice NAND transistors available for hatching.
    function nandStock() public view returns (uint256) {
        return transistors.balanceOf(address(this), NAND_ID);
    }

    function hatch(uint256 eggId, bytes calldata netlist) external payable nonReentrant returns (uint256 circuitId) {
        Egg storage e = _egg(eggId);
        if (e.breeder != msg.sender) revert NotBreeder();
        if (e.hatchedAs != 0) revert AlreadyHatched();

        uint256 gates = _validate(netlist);
        uint256 cost = hatchCost();
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        uint32 generation = _max(_creatures[e.parentA].generation, _creatures[e.parentB].generation) + 1;
        circuitId = _tapeout(netlist, gates);
        e.hatchedAs = uint64(circuitId);
        _register(circuitId, Creature(e.parentA, e.parentB, generation, uint64(eggId), e.seed));

        circuits.transferFrom(address(this), msg.sender, circuitId);
        emit Hatched(eggId, circuitId, msg.sender, generation);
    }

    // ---------------------------------------------------------------- creature owners

    function setStudFee(uint256 circuitId, uint256 fee) external {
        if (!isCreature[circuitId]) revert NotCreature(circuitId);
        if (circuits.ownerOf(circuitId) != msg.sender) revert NotCircuitOwner();
        studFee[circuitId] = fee;
        emit StudFeeSet(circuitId, fee);
    }

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credits[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Tapes out a generation-0 creature and sends it to the owner.
    function seedFounder(bytes calldata netlist) external payable onlyOwner nonReentrant returns (uint256 circuitId) {
        uint256 gates = _validate(netlist);
        uint256 cost = hatchCost();
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        circuitId = _tapeout(netlist, gates);
        _register(circuitId, Creature(0, 0, 0, 0, bytes32(0)));
        circuits.transferFrom(address(this), msg.sender, circuitId);
        emit FounderSeeded(circuitId);
    }

    function setBreedFee(uint256 fee) external onlyOwner {
        breedFee = fee;
        emit BreedFeeSet(fee);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------- views

    function creatureCount() external view returns (uint256) {
        return _creatureIds.length;
    }

    function eggCount() external view returns (uint256) {
        return _eggs.length;
    }

    function creature(uint256 circuitId) external view returns (Creature memory) {
        if (!isCreature[circuitId]) revert NotCreature(circuitId);
        return _creatures[circuitId];
    }

    function egg(uint256 eggId) external view returns (Egg memory) {
        return _egg(eggId);
    }

    function eggsOf(address breeder) external view returns (uint256[] memory) {
        return _eggsOf[breeder];
    }

    /// @notice Paged creature listing including netlists. X Layer RPCs cap eth_getLogs at
    ///         100 blocks, so clients load state through this view instead of event scans.
    function creatures(uint256 offset, uint256 limit) external view returns (CreatureView[] memory page) {
        uint256 total = _creatureIds.length;
        if (offset >= total) return new CreatureView[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new CreatureView[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            uint256 id = _creatureIds[i];
            Creature storage c = _creatures[id];
            page[i - offset] = CreatureView({
                id: id,
                owner: circuits.ownerOf(id),
                parentA: c.parentA,
                parentB: c.parentB,
                generation: c.generation,
                eggId: c.eggId,
                seed: c.seed,
                studFee: studFee[id],
                netlist: circuits.netlist(id)
            });
        }
    }

    // ---------------------------------------------------------------- token receivers

    /// @dev TapeOut mints transistors (ERC-1155) and circuits (ERC-721) to this contract.
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 // ERC-165
            || interfaceId == 0x4e2312e0 // ERC-1155 receiver
            || interfaceId == 0x150b7a02; // ERC-721 receiver
    }

    // ---------------------------------------------------------------- internals

    /// @dev NAND-only, 3..64 gates. Signal-ordering rules are enforced by TapeOut itself.
    ///      Rejecting LATCH/REF here guarantees gates == NAND burned == NAND minted.
    function _validate(bytes calldata netlist) private pure returns (uint256 gates) {
        if (netlist.length == 0 || netlist.length % NAND_BYTES != 0) revert BadNetlist();
        gates = netlist.length / NAND_BYTES;
        if (gates < N_OUT || gates > MAX_GATES) revert BadNetlist();
        for (uint256 i = 0; i < netlist.length; i += NAND_BYTES) {
            if (netlist[i] != 0x00) revert BadNetlist();
        }
    }

    /// @dev TapeOut burns one NAND per gate from this contract's stock.
    function _tapeout(bytes calldata netlist, uint256 gates) private returns (uint256) {
        uint256 stock = nandStock();
        if (stock < gates) revert OutOfNand(gates, stock);
        return circuits.tapeout{value: circuits.TAPEOUT_FEE()}(netlist, N_IN, N_OUT);
    }

    function _register(uint256 circuitId, Creature memory c) private {
        _creatures[circuitId] = c;
        isCreature[circuitId] = true;
        _creatureIds.push(circuitId);
    }

    function _creditStud(uint256 parent) private {
        uint256 fee = studFee[parent];
        if (fee == 0) return;
        address parentOwner = circuits.ownerOf(parent);
        if (parentOwner != msg.sender) credits[parentOwner] += fee;
    }

    function _egg(uint256 eggId) private view returns (Egg storage) {
        if (eggId == 0 || eggId > _eggs.length) revert UnknownEgg();
        return _eggs[eggId - 1];
    }

    function _max(uint32 a, uint32 b) private pure returns (uint32) {
        return a > b ? a : b;
    }
}
