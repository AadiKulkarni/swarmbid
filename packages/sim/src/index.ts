/**
 * @swarmbid/sim — pure TypeScript multi-robot auction simulation.
 *
 * Owns the seeded PRNG, grid world, deterministic message bus, robot
 * controller interface, metrics, and auction stubs. No UI dependencies.
 */

export { computeBid } from "./auction/bid.js";
export type { BidInput } from "./auction/bid.js";
export { resolveConsensus } from "./auction/consensus.js";
export type {
  ConsensusInput,
  ConsensusResult,
  WinningBid,
} from "./auction/consensus.js";
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
