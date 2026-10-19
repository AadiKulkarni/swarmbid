/**
 * [ME] Compute a robot's bid for a task.
 *
 * Must return a non-negative score reflecting how valuable it is for
 * `robot` to take `task`, typically reward discounted by travel cost
 * (e.g. Manhattan distance / speed). Higher bids win during consensus.
 * Must be deterministic: same inputs → same bid (no wall-clock or RNG).
 */

import type { RobotState, TaskState, WorldState } from "../types.js";

export interface BidInput {
  robot: RobotState;
  task: TaskState;
  world: WorldState;
}

/**
 * Compute the scalar bid this robot places on the given task.
 */
export function computeBid(_input: BidInput): number {
  throw new Error("TODO");
}
