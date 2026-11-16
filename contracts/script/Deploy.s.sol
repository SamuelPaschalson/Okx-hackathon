// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Lineage} from "../src/Lineage.sol";
import {IERC20Minimal, ITapeOutCircuits, ITapeOutFactory, ITapeOutTransistors} from "../src/ITapeOut.sol";

/// @notice One-shot deployment of Lineage on X Layer.
///
///   1. Creates the "Lineage" TapeOut processor (paid in BEM), unless LINEAGE_TRANSISTORS is set.
///   2. Deploys Lineage.
///   3. Mints NAND_STOCK transistors (paid in BEM) and deposits them into Lineage.
///   4. Tapes out the founders from fixtures/lineage.json (paid in OKB).
///
/// The broadcasting wallet needs a little BEM and OKB. Never put a private key in .env;
/// sign with a keystore or hardware wallet:
///
///   forge script script/Deploy.s.sol --rpc-url xlayer --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url xlayer --ledger --broadcast
///
/// Rehearse first on a fork (no --broadcast) to see every step and its cost.
contract Deploy is Script {
    ITapeOutFactory constant FACTORY = ITapeOutFactory(0x1f09DAeFA827f02CBb40967cc91b259763760761);

    function run() external {
        uint256 breedFee = vm.envOr("BREED_FEE", uint256(0.002 ether));
        uint256 nandStock = vm.envOr("NAND_STOCK", uint256(50_000));
        address existing = vm.envOr("LINEAGE_TRANSISTORS", address(0));
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/fixtures/lineage.json"));
        uint256 nFounders = abi.decode(vm.parseJson(json, ".founders"), (bytes[])).length;

        vm.startBroadcast();
        IERC20Minimal bem = IERC20Minimal(FACTORY.bem());

        ITapeOutTransistors transistors;
        if (existing == address(0)) {
            bem.approve(address(FACTORY), FACTORY.deployFee());
            (address t,) = FACTORY.createCPU(
                "Lineage", "LNG", "Creatures whose DNA is a NAND circuit. Bred, not designed.", 1_000_000, 0
            );
            transistors = ITapeOutTransistors(t);
        } else {
            transistors = ITapeOutTransistors(existing);
        }

        Lineage lineage = new Lineage(transistors, breedFee);

        // mintPrice is 0, so the mint costs only the flat protocol fee, in BEM.
        bem.approve(address(transistors), nandStock * transistors.mintPrice() + transistors.protocolFee());
        transistors.mint(0, nandStock);
        transistors.safeTransferFrom(msg.sender, address(lineage), 0, nandStock, "");

        uint256 fee = lineage.hatchCost();
        for (uint256 i = 0; i < nFounders; i++) {
            bytes memory netlist = vm.parseJsonBytes(json, string.concat(".founders[", vm.toString(i), "].netlist"));
            uint256 id = lineage.seedFounder{value: fee}(netlist);
            console2.log("founder", vm.parseJsonString(json, string.concat(".founders[", vm.toString(i), "].name")), id);
        }
        vm.stopBroadcast();

        console2.log("transistors", address(transistors));
        console2.log("circuits   ", address(lineage.circuits()));
        console2.log("lineage    ", address(lineage));
        console2.log("nand stock ", lineage.nandStock());
    }
}
