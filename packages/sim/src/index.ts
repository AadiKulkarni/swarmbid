/**
 * @swarmbid/sim — pure TypeScript multi-robot auction simulation.
 *
 * Owns the seeded PRNG, grid world, deterministic message bus, robot
 * controller interface, metrics, and CBBA auction. No UI dependencies.
 */

export {
  assignmentFromAgents,
  CONSENSUS_MSG_TYPE,
  controllersFromAgents,
  createCbbaAgent,
  createCbbaAgents,
  parseConsensusMessage,
} from "./auction/agent.js";
export type { CbbaAgent, CbbaAgentOptions } from "./auction/agent.js";
export {
  bestInsertion,
  buildBundle,
  computeBid,
  DEFAULT_MAX_BUNDLE_SIZE,
  pathScore,
  travelTime,
} from "./auction/bid.js";
export type { BidInput, BundleBuildResult, InsertionResult } from "./auction/bid.js";
export {
  applyConsensusMessage,
  bidBeats,
  consensusActionForTask,
  createConsensusState,
  mergeTimestamps,
  NO_WINNER,
  releaseOutbidTasks,
  resolveConsensus,
  winningBidsFromState,
} from "./auction/consensus.js";
export type {
  ConsensusAction,
  ConsensusInput,
  ConsensusMessage,
  ConsensusResult,
  ConsensusState,
  WinningBid,
} from "./auction/consensus.js";
export {
  assignmentFromWorldAndAgents,
  createAuctionSimulation,
  isConflictFree,
  runAuction,
  syncAssignmentsToWorld,
} from "./auction/run.js";
export type { AuctionRunOptions, AuctionRunResult } from "./auction/run.js";
export {
  assignmentMap,
  countDoubleAssigned,
  countUnassigned,
  emptyMetrics,
  totalRewardCollected,
  updateMetrics,
} from "./metrics.js";
export { DEFAULT_NETWORK_CONFIG, MessageBus } from "./network.js";
export { createMulberry32, nextBool, nextInt, shuffleInPlace } from "./prng.js";
export type { Rng } from "./prng.js";
export { idleController, onTick } from "./robot.js";
export type { RobotAction, RobotController, RobotTickInput } from "./robot.js";
export { Simulation } from "./simulation.js";
export type { SimulationOptions, SimulationSnapshot } from "./simulation.js";
export type {
  Message,
  Metrics,
  MoveCommand,
  NetworkConfig,
  RobotState,
  SimEvent,
  TaskState,
  Vec2,
  WorldConfig,
  WorldState,
} from "./types.js";
export {
  advanceTick,
  applyMoves,
  collectColocatedTasks,
  createWorld,
  manhattan,
} from "./world.js";
