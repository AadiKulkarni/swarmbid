/**
 * CBBA Phase 1 — marginal-score bidding and greedy bundle construction.
 *
 * A robot's bid for a task is the marginal path-score gain of inserting that
 * task at the best position in its current path. Path score is the sum over
 * waypoints of (reward − travel time from the previous waypoint), so longer
 * detours bid lower. Bundles grow greedily up to `maxBundleSize`.
 */

import { manhattan } from "../world.js";
import type { RobotState, TaskState, Vec2, WorldState } from "../types.js";

/** Default CBBA bundle / path capacity L_t. */
export const DEFAULT_MAX_BUNDLE_SIZE = 3;

export interface BidInput {
  robot: RobotState;
  task: TaskState;
  world: WorldState;
  /** Current path (ordered waypoints). Empty means path starts at robot. */
  path?: readonly TaskState[];
  /** Max tasks in the bundle. Defaults to DEFAULT_MAX_BUNDLE_SIZE. */
  maxBundleSize?: number;
}

export interface InsertionResult {
  /** Marginal score gain S(path ⊕ task) − S(path), floored at 0. */
  marginal: number;
  /** Index in path at which to insert (0..path.length). */
  insertIndex: number;
}

export interface BundleBuildResult {
  /** Task ids in the order they were added (bundle order). */
  bundle: string[];
  /** Task ids in visit order (path order). */
  path: string[];
  /** Marginal bid placed when each task was added. */
  bids: Map<string, number>;
}

/**
 * Travel time (ticks) between two points at the given speed.
 * Speed is cells per tick; distance is Manhattan cells.
 */
export function travelTime(from: Vec2, to: Vec2, speed: number): number {
  const s = Math.max(1, speed);
  return manhattan(from, to) / s;
}

/**
 * Total path score: Σ_j (reward_j − arrivalTime_j), where arrivalTime_j is
 * the cumulative travel time from `start` along the path up to j.
 */
export function pathScore(start: Vec2, path: readonly TaskState[], speed: number): number {
  let score = 0;
  let time = 0;
  let prev = start;
  for (const task of path) {
    time += travelTime(prev, task.position, speed);
    score += task.reward - time;
    prev = task.position;
  }
  return score;
}

/**
 * Best insertion of `task` into `path`: returns marginal score gain and index.
 * Marginal is 0 when the task is already on the path.
 */
export function bestInsertion(
  start: Vec2,
  path: readonly TaskState[],
  task: TaskState,
  speed: number,
): InsertionResult {
  if (path.some((t) => t.id === task.id)) {
    return { marginal: 0, insertIndex: 0 };
  }

  const base = pathScore(start, path, speed);
  let bestMarginal = -Infinity;
  let bestIndex = 0;

  for (let i = 0; i <= path.length; i++) {
    const next = [...path.slice(0, i), task, ...path.slice(i)];
    const marginal = pathScore(start, next, speed) - base;
    if (marginal > bestMarginal) {
      bestMarginal = marginal;
      bestIndex = i;
    }
  }

  return {
    marginal: Math.max(0, bestMarginal),
    insertIndex: bestIndex,
  };
}

/**
 * Compute the scalar bid this robot places on the given task — the marginal
 * score gain of the best insertion into its current path.
 */
export function computeBid(input: BidInput): number {
  const path = input.path ?? [];
  const { marginal } = bestInsertion(
    input.robot.position,
    path,
    input.task,
    input.robot.speed,
  );
  return marginal;
}

/**
 * Greedily grow a bundle / path up to `maxBundleSize`.
 *
 * At each step pick the available task with the highest marginal score that
 * beats the current winning bid `y.get(taskId)` (strictly greater, matching
 * CBBA's h_ij = I(c_ij > y_ij)). Ties break by task id.
 *
 * When `initialBundle` / `initialPath` are provided (after a consensus
 * release truncated the lists), growth continues from that prefix.
 */
export function buildBundle(options: {
  robot: RobotState;
  tasks: readonly TaskState[];
  /** Current winning bids known locally (taskId → bid). Missing ⇒ 0. */
  winningBids?: ReadonlyMap<string, number>;
  /** Current winners known locally (taskId → robotId). */
  winningAgents?: ReadonlyMap<string, string>;
  /** Tasks this robot must not re-select. */
  exclude?: ReadonlySet<string>;
  maxBundleSize?: number;
  /** Remaining bundle prefix after consensus release. */
  initialBundle?: readonly string[];
  /** Remaining path prefix matching initialBundle tasks. */
  initialPath?: readonly string[];
  /** Prior marginal bids for tasks kept in the initial prefix. */
  initialBids?: ReadonlyMap<string, number>;
}): BundleBuildResult {
  const maxBundleSize = options.maxBundleSize ?? DEFAULT_MAX_BUNDLE_SIZE;
  const winningBids = options.winningBids ?? new Map<string, number>();
  const winningAgents = options.winningAgents ?? new Map<string, string>();
  const exclude = new Set(options.exclude ?? []);
  const byId = new Map(options.tasks.map((t) => [t.id, t]));

  const bundle: string[] = [...(options.initialBundle ?? [])];
  const pathTasks: TaskState[] = [];
  for (const id of options.initialPath ?? []) {
    const task = byId.get(id);
    if (task) {
      pathTasks.push(task);
    }
  }
  // If path was not supplied, fall back to bundle order as path.
  if (pathTasks.length === 0) {
    for (const id of bundle) {
      const task = byId.get(id);
      if (task) {
        pathTasks.push(task);
      }
    }
  }

  const bids = new Map<string, number>(options.initialBids ?? []);

  const available = () =>
    options.tasks.filter(
      (t) =>
        t.collectedBy === null &&
        !exclude.has(t.id) &&
        !bundle.includes(t.id),
    );

  while (bundle.length < maxBundleSize) {
    let best: { task: TaskState; marginal: number; insertIndex: number } | null = null;

    for (const task of available()) {
      const { marginal, insertIndex } = bestInsertion(
        options.robot.position,
        pathTasks,
        task,
        options.robot.speed,
      );
      const y = winningBids.get(task.id) ?? 0;
      const winner = winningAgents.get(task.id) ?? "";
      // Strict improvement, or equal bid with a better (smaller) robot id.
      const canWin =
        marginal > y ||
        (marginal === y &&
          (winner === "" || options.robot.id.localeCompare(winner) < 0));
      if (!canWin) {
        continue;
      }
      if (
        best === null ||
        marginal > best.marginal ||
        (marginal === best.marginal && task.id.localeCompare(best.task.id) < 0)
      ) {
        best = { task, marginal, insertIndex };
      }
    }

    if (best === null) {
      break;
    }

    bundle.push(best.task.id);
    pathTasks.splice(best.insertIndex, 0, best.task);
    bids.set(best.task.id, best.marginal);
  }

  return {
    bundle,
    path: pathTasks.map((t) => t.id),
    bids,
  };
}
