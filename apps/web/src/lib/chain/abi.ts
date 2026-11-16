import { parseAbi } from 'viem';

/**
 * Human-readable ABI for the parts of contracts/src/Lineage.sol the app uses.
 * Keep in sync with the contract (`forge inspect Lineage abi` lists the source of truth).
 */
export const lineageAbi = parseAbi([
  'struct CreatureView { uint256 id; address owner; uint64 parentA; uint64 parentB; uint32 generation; uint64 eggId; bytes32 seed; uint256 studFee; bytes netlist; }',
  'struct Egg { address breeder; uint64 parentA; uint64 parentB; uint64 hatchedAs; bytes32 seed; }',
  'function circuits() view returns (address)',
  'function breedFee() view returns (uint256)',
  'function hatchCost() view returns (uint256)',
  'function nandStock() view returns (uint256)',
  'function creatureCount() view returns (uint256)',
  'function creatures(uint256 offset, uint256 limit) view returns (CreatureView[])',
  'function layCost(uint256 parentA, uint256 parentB, address breeder) view returns (uint256)',
  'function egg(uint256 eggId) view returns (Egg)',
  'function eggsOf(address breeder) view returns (uint256[])',
  'function layEgg(uint256 parentA, uint256 parentB) payable returns (uint256)',
  'function hatch(uint256 eggId, bytes netlist) payable returns (uint256)',
  'event EggLaid(uint256 indexed eggId, address indexed breeder, uint256 parentA, uint256 parentB, bytes32 seed)',
  'event Hatched(uint256 indexed eggId, uint256 indexed circuitId, address indexed breeder, uint32 generation)',
  'error NotCreature(uint256 circuitId)',
  'error SameParent()',
  'error WrongPayment(uint256 expected, uint256 sent)',
  'error NotBreeder()',
  'error AlreadyHatched()',
  'error UnknownEgg()',
  'error BadNetlist()',
  'error OutOfNand(uint256 needed, uint256 stock)',
]);

export const circuitsAbi = parseAbi(['function eval(uint256 id, bytes inputs) view returns (bytes)']);
