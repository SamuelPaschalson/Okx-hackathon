// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Lineage} from "../src/Lineage.sol";
import {ITapeOutTransistors} from "../src/ITapeOut.sol";
import {MockCircuits, MockTransistors} from "./mocks/MockTapeOut.sol";

contract LineageTest is Test {
    MockTransistors transistors;
    MockCircuits circuits;
    Lineage lineage;

    address deployer = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant BREED_FEE = 0.01 ether;
    uint256 constant STOCK = 1000;

    uint256 founderA;
    uint256 founderB;

    function setUp() public {
        transistors = new MockTransistors(0, 0);
        circuits = MockCircuits(transistors.circuits());
        lineage = new Lineage(ITapeOutTransistors(address(transistors)), BREED_FEE);

        // Operator stocks the contract with NAND (on mainnet this mint is paid in BEM).
        transistors.mint(0, STOCK);
        transistors.safeTransferFrom(address(this), address(lineage), 0, STOCK, "");

        founderA = _seed(8);
        founderB = _seed(22);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    receive() external payable {}

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    // ------------------------------------------------------------ founders

    function test_seedFounder_registersGenerationZeroAndSendsNftToOwner() public view {
        assertTrue(lineage.isCreature(founderA));
        assertEq(circuits.ownerOf(founderA), deployer);
        Lineage.Creature memory c = lineage.creature(founderA);
        assertEq(c.generation, 0);
        assertEq(c.eggId, 0);
        assertEq(lineage.creatureCount(), 2);
        // TapeOut burned exactly one NAND per gate from the stock.
        assertEq(lineage.nandStock(), STOCK - 8 - 22);
    }

    function test_seedFounder_onlyOwner() public {
        bytes memory nl = _netlist(5);
        uint256 cost = lineage.hatchCost();
        vm.prank(alice);
        vm.expectRevert(Lineage.NotOwner.selector);
        lineage.seedFounder{value: cost}(nl);
    }

    // ------------------------------------------------------------ laying eggs

    function test_layEgg_chargesBreedFeeAndFixesSeed() public {
        vm.prank(alice);
        uint256 eggId = lineage.layEgg{value: BREED_FEE}(founderA, founderB);

        Lineage.Egg memory egg = lineage.egg(eggId);
        assertEq(egg.breeder, alice);
        assertEq(egg.parentA, founderA);
        assertEq(egg.parentB, founderB);
        assertTrue(egg.seed != bytes32(0));
        assertEq(lineage.credits(deployer), BREED_FEE);
        assertEq(lineage.eggsOf(alice).length, 1);
    }

    function test_layEgg_seedsDifferPerEgg() public {
        vm.startPrank(alice);
        uint256 e1 = lineage.layEgg{value: BREED_FEE}(founderA, founderB);
        uint256 e2 = lineage.layEgg{value: BREED_FEE}(founderA, founderB);
        vm.stopPrank();
        assertTrue(lineage.egg(e1).seed != lineage.egg(e2).seed);
    }

    function test_layEgg_rejectsUnknownSameAndWrongPayment() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Lineage.NotCreature.selector, 999));
        lineage.layEgg{value: BREED_FEE}(founderA, 999);

        vm.expectRevert(Lineage.SameParent.selector);
        lineage.layEgg{value: BREED_FEE}(founderA, founderA);

        vm.expectRevert(abi.encodeWithSelector(Lineage.WrongPayment.selector, BREED_FEE, BREED_FEE + 1));
        lineage.layEgg{value: BREED_FEE + 1}(founderA, founderB);
        vm.stopPrank();
    }

    function test_studFees_paidToOtherOwnersOnly() public {
        lineage.setStudFee(founderA, 0.05 ether);

        // Alice does not own founderA: pays breed fee + stud fee.
        assertEq(lineage.layCost(founderA, founderB, alice), BREED_FEE + 0.05 ether);
        vm.prank(alice);
        lineage.layEgg{value: BREED_FEE + 0.05 ether}(founderA, founderB);
        assertEq(lineage.credits(deployer), BREED_FEE + 0.05 ether);

        // The owner breeding their own stud pays no stud fee.
        assertEq(lineage.layCost(founderA, founderB, deployer), BREED_FEE);
    }

    function test_setStudFee_onlyCircuitOwner() public {
        vm.prank(alice);
        vm.expectRevert(Lineage.NotCircuitOwner.selector);
        lineage.setStudFee(founderA, 1 ether);
    }

    // ------------------------------------------------------------ hatching

    function test_hatch_tapesOutChildAndRecordsLineage() public {
        uint256 eggId = _lay(alice);
        bytes memory child = _netlist(12);
        uint256 cost = lineage.hatchCost();
        assertEq(cost, circuits.TAPEOUT_FEE());
        uint256 stockBefore = lineage.nandStock();

        vm.prank(alice);
        uint256 id = lineage.hatch{value: cost}(eggId, child);

        assertEq(circuits.ownerOf(id), alice);
        assertEq(circuits.netlist(id), child);
        Lineage.Creature memory c = lineage.creature(id);
        assertEq(c.parentA, founderA);
        assertEq(c.parentB, founderB);
        assertEq(c.generation, 1);
        assertEq(c.eggId, eggId);
        assertEq(c.seed, lineage.egg(eggId).seed);
        assertEq(lineage.egg(eggId).hatchedAs, id);
        assertEq(lineage.nandStock(), stockBefore - 12);
    }

    function test_hatch_generationIsMaxParentPlusOne() public {
        uint256 gen1 = _hatch(alice, _lay(alice), 6);
        vm.prank(alice);
        uint256 egg2 = lineage.layEgg{value: BREED_FEE}(gen1, founderA);
        uint256 gen2 = _hatch(alice, egg2, 6);
        assertEq(lineage.creature(gen2).generation, 2);
    }

    function test_hatch_onlyBreederOnceExactPayment() public {
        uint256 eggId = _lay(alice);
        bytes memory nl = _netlist(6);
        uint256 cost = lineage.hatchCost();

        vm.prank(bob);
        vm.expectRevert(Lineage.NotBreeder.selector);
        lineage.hatch{value: cost}(eggId, nl);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Lineage.WrongPayment.selector, cost, cost - 1));
        lineage.hatch{value: cost - 1}(eggId, nl);

        vm.prank(alice);
        lineage.hatch{value: cost}(eggId, nl);

        vm.prank(alice);
        vm.expectRevert(Lineage.AlreadyHatched.selector);
        lineage.hatch{value: cost}(eggId, nl);

        vm.expectRevert(Lineage.UnknownEgg.selector);
        lineage.hatch{value: cost}(42, nl);
    }

    function test_hatch_rejectsMalformedNetlists() public {
        uint256 eggId = _lay(alice);
        vm.startPrank(alice);

        vm.expectRevert(Lineage.BadNetlist.selector);
        lineage.hatch(eggId, hex"");

        vm.expectRevert(Lineage.BadNetlist.selector);
        lineage.hatch(eggId, hex"00000002000003ff"); // not a multiple of 7

        vm.expectRevert(Lineage.BadNetlist.selector);
        lineage.hatch(eggId, _netlist(2)); // fewer gates than outputs

        vm.expectRevert(Lineage.BadNetlist.selector);
        lineage.hatch(eggId, _netlist(65)); // over the cap

        bytes memory latch = _netlist(4);
        latch[7] = 0x01; // second element is a LATCH
        vm.expectRevert(Lineage.BadNetlist.selector);
        lineage.hatch(eggId, latch);
        vm.stopPrank();
    }

    function test_hatch_revertsWhenOutOfNand() public {
        // Drain the stock down to 5 NAND with founders.
        while (lineage.nandStock() >= 64 + 5) _seed(64);
        uint256 rest = lineage.nandStock() - 5;
        if (rest >= 3) _seed(rest);
        assertEq(lineage.nandStock(), 5);

        uint256 eggId = _lay(alice);
        uint256 cost = lineage.hatchCost();
        bytes memory nl = _netlist(6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Lineage.OutOfNand.selector, 6, 5));
        lineage.hatch{value: cost}(eggId, nl);
    }

    function testFuzz_hatch_anySizeInRange(uint8 size) public {
        uint256 gates = bound(size, 3, 64);
        uint256 stockBefore = lineage.nandStock();
        uint256 id = _hatch(alice, _lay(alice), gates);
        assertEq(circuits.netlist(id).length, gates * 7);
        assertEq(lineage.nandStock(), stockBefore - gates);
    }

    // ------------------------------------------------------------ payouts

    function test_withdraw_paysCreditsOnce() public {
        _lay(alice);
        uint256 before = deployer.balance;
        lineage.withdraw();
        assertEq(deployer.balance, before + BREED_FEE);

        vm.expectRevert(Lineage.NothingToWithdraw.selector);
        lineage.withdraw();
    }

    function test_withdraw_blocksReentrancy() public {
        Reenterer attacker = new Reenterer(lineage, founderA, founderB);
        lineage.setStudFee(founderA, 1 ether);
        lineage.transferOwnership(address(attacker)); // attacker earns breed fees
        vm.prank(alice);
        lineage.layEgg{value: BREED_FEE + 1 ether}(founderA, founderB);
        // Attacker's receive() re-enters layEgg; the guard reverts, so withdraw fails as a whole.
        vm.expectRevert(Lineage.TransferFailed.selector);
        attacker.attack();
    }

    // ------------------------------------------------------------ listing

    function test_creatures_pagesWithNetlistsAndOwners() public {
        uint256 child = _hatch(alice, _lay(alice), 9);

        Lineage.CreatureView[] memory all = lineage.creatures(0, 10);
        assertEq(all.length, 3);
        assertEq(all[2].id, child);
        assertEq(all[2].owner, alice);
        assertEq(all[2].netlist, _netlist(9));
        assertEq(all[2].generation, 1);

        assertEq(lineage.creatures(1, 1).length, 1);
        assertEq(lineage.creatures(1, 1)[0].id, founderB);
        assertEq(lineage.creatures(5, 10).length, 0);
    }

    // ------------------------------------------------------------ helpers

    /// @dev n gates, each NAND(input0, input1): always valid.
    function _netlist(uint256 n) internal pure returns (bytes memory nl) {
        nl = new bytes(n * 7);
        for (uint256 i = 0; i < n; i++) {
            nl[i * 7 + 3] = 0x02;
            nl[i * 7 + 6] = 0x03;
        }
    }

    function _seed(uint256 gates) internal returns (uint256) {
        return lineage.seedFounder{value: lineage.hatchCost()}(_netlist(gates));
    }

    function _lay(address who) internal returns (uint256) {
        // Compute first: vm.prank applies to the next call, which would otherwise be layCost.
        uint256 cost = lineage.layCost(founderA, founderB, who);
        vm.prank(who);
        return lineage.layEgg{value: cost}(founderA, founderB);
    }

    function _hatch(address who, uint256 eggId, uint256 gates) internal returns (uint256) {
        uint256 cost = lineage.hatchCost();
        vm.prank(who);
        return lineage.hatch{value: cost}(eggId, _netlist(gates));
    }
}

contract Reenterer {
    Lineage immutable lineage;
    uint256 immutable a;
    uint256 immutable b;

    constructor(Lineage lineage_, uint256 a_, uint256 b_) {
        lineage = lineage_;
        a = a_;
        b = b_;
    }

    function attack() external {
        lineage.withdraw();
    }

    receive() external payable {
        lineage.layEgg{value: msg.value}(a, b);
    }
}
