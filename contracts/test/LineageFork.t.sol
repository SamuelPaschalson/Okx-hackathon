// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Lineage} from "../src/Lineage.sol";
import {IERC20Minimal, ITapeOutCircuits, ITapeOutFactory, ITapeOutTransistors} from "../src/ITapeOut.sol";

/// @notice End-to-end against the real TapeOut contracts on an X Layer mainnet fork.
/// Opt-in (needs network):  XLAYER_RPC=https://rpc.xlayer.tech forge test --match-contract Fork
contract LineageForkTest is Test {
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);

    Lineage lineage;
    ITapeOutCircuits circuits;
    string json;
    uint256 nFounders;

    function setUp() public {
        string memory rpc = vm.envOr("XLAYER_RPC", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);

        json = vm.readFile(string.concat(vm.projectRoot(), "/fixtures/lineage.json"));
        nFounders = abi.decode(vm.parseJson(json, ".founders"), (bytes[])).length;

        vm.deal(address(this), 100 ether);
        // Since TapeOut's upgrade, CPU creation and transistor minting are paid in BEM.
        IERC20Minimal bem = IERC20Minimal(FACTORY.bem());
        deal(address(bem), address(this), 1e8); // 1 BEM: plenty for deploy + one mint
        bem.approve(address(FACTORY), type(uint256).max);
        (address transistors_, address circuits_) =
            FACTORY.createCPU("Lineage", "LNG", "Creatures whose DNA is a circuit.", 1_000_000, 0);
        circuits = ITapeOutCircuits(circuits_);
        ITapeOutTransistors transistors = ITapeOutTransistors(transistors_);
        lineage = new Lineage(transistors, 0.001 ether);

        // Operator stocks Lineage with NAND once; players then pay only OKB.
        bem.approve(transistors_, type(uint256).max);
        transistors.mint(0, 10_000);
        transistors.safeTransferFrom(address(this), address(lineage), 0, 10_000, "");
        assertEq(lineage.nandStock(), 10_000);
    }

    receive() external payable {}

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function test_fork_foundersTapeOutAndEvalMatchesCore() public {
        for (uint256 i = 0; i < nFounders; i++) {
            bytes memory netlist = vm.parseJsonBytes(json, _key(i, ".netlist"));
            uint256 gates = vm.parseJsonUint(json, _key(i, ".gates"));
            uint256 id = lineage.seedFounder{value: lineage.hatchCost()}(netlist);

            assertEq(circuits.ownerOf(id), address(this));
            assertEq(circuits.netlist(id), netlist);
            (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount) = circuits.circuitInfo(id);
            assertEq(nIn, 10);
            assertEq(nOut, 3);
            assertEq(nState, 0);
            assertEq(gateCount, gates);

            // TapeOut's own eval() must agree with @lineage/core on every exported vector.
            for (uint256 v = 0; v < 8; v++) {
                bytes memory input = vm.parseJsonBytes(json, _vec(i, v, ".input"));
                bytes memory expected = vm.parseJsonBytes(json, _vec(i, v, ".output"));
                assertEq(circuits.eval(id, input), expected, "eval mismatch with core");
            }
        }
    }

    function test_fork_layEggAndHatchThroughRealTapeOut() public {
        bytes memory a = vm.parseJsonBytes(json, _key(0, ".netlist"));
        bytes memory b = vm.parseJsonBytes(json, _key(1, ".netlist"));
        uint256 pa = lineage.seedFounder{value: lineage.hatchCost()}(a);
        uint256 pb = lineage.seedFounder{value: lineage.hatchCost()}(b);

        address breeder = makeAddr("breeder");
        vm.deal(breeder, 1 ether);
        vm.startPrank(breeder);
        uint256 eggId = lineage.layEgg{value: lineage.layCost(pa, pb, breeder)}(pa, pb);
        // Any canonical child works here; derivation is checked client-side. Use parent B's genome.
        uint256 child = lineage.hatch{value: lineage.hatchCost()}(eggId, b);
        vm.stopPrank();

        assertEq(circuits.ownerOf(child), breeder);
        assertEq(lineage.creature(child).generation, 1);
        assertEq(lineage.creatures(0, 10).length, 3);
        assertEq(lineage.creatures(0, 10)[2].netlist, b);
    }

    function _key(uint256 i, string memory field) private pure returns (string memory) {
        return string.concat(".founders[", vm.toString(i), "]", field);
    }

    function _vec(uint256 i, uint256 v, string memory field) private pure returns (string memory) {
        return string.concat(".founders[", vm.toString(i), "].vectors[", vm.toString(v), "]", field);
    }
}
