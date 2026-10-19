/**
 * Helpers to run CBBA auctions to convergence for tests and benchmarks.
 */

import { countDoubleAssigned, countUnassigned, totalRewardCollected } from "../metrics.js";
import { Simulation, type SimulationOptions, type SimulationSnapshot } from "../simulation.js";
import type { NetworkConfig, WorldConfig } from "../types.js";
import { createWorld } from "../world.js";
import {
  assignmentFromAgents,
  controllersFromAgents,
  createCbbaAgents,
  type CbbaAgent,
} from "./agent.js";
import { DEFAULT_MAX_BUNDLE_SIZE } from "./bid.js";

export interface AuctionRunOptions {
  world: WorldConfig;
  network?: Partial<NetworkConfig>;
  maxBundleSize?: number;
  /** Max ticks before giving up. */
  maxTicks?: number;
  /** Stable assignment for this many consecutive ticks ⇒ converged. */
  stableTicks?: number;
}

export interface AuctionRunResult {
  snapshot: SimulationSnapshot;
  agents: Map<string, CbbaAgent>;
  /** Assignment at the moment of convergence (before collection clears bundles). */
  assignment: Map<string, string>;
  converged: boolean;
  roundsToConverge: number | null;
}

function robotIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `r${i}`);
}

function assignmentsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [k, v] of a) {
    if (b.get(k) !== v) {
      return false;
    }
  }
  return true;
}

/** True when no task appears in more than one agent's bundle. */
export function isConflictFree(agents: Map<string, CbbaAgent>): boolean {
  const seen = new Set<string>();
  for (const agent of agents.values()) {
    for (const taskId of agent.getBundle()) {
      if (seen.has(taskId)) {
        return false;
      }
      seen.add(taskId);
    }
  }
  return true;
}

/** Sync agent bundles onto world.robots for metrics. */
export function syncAssignmentsToWorld(
  snapshot: SimulationSnapshot,
  agents: Map<string, CbbaAgent>,
): SimulationSnapshot {
  const assignment = assignmentFromAgents(agents);
  const claimedByRobot = new Map<string, string[]>();
  for (const [taskId, robotId] of assignment) {
    const list = claimedByRobot.get(robotId) ?? [];
    list.push(taskId);
    claimedByRobot.set(robotId, list);
  }

  const robots = snapshot.world.robots.map((robot) => {
    const ids = claimedByRobot.get(robot.id) ?? [];
    return {
      ...robot,
      assignedTaskId: ids[0] ?? null,
      assignedTaskIds: ids,
    };
  });

  const world = { ...snapshot.world, robots };
  return {
    ...snapshot,
    world,
    metrics: {
      ...snapshot.metrics,
      totalRewardCollected: totalRewardCollected(world),
      tasksDoubleAssigned: countDoubleAssigned(world),
      tasksUnassigned: countUnassigned(world),
    },
  };
}

/**
 * Create a Simulation wired with CBBA agents.
 */
export function createAuctionSimulation(options: AuctionRunOptions): {
  sim: Simulation;
  agents: Map<string, CbbaAgent>;
} {
  const ids = robotIds(options.world.robotCount);
  const initial = createWorld(options.world);
  const origins = new Map(initial.robots.map((r) => [r.id, { ...r.position }]));
  const agents = createCbbaAgents(ids, {
    maxBundleSize: options.maxBundleSize ?? DEFAULT_MAX_BUNDLE_SIZE,
    origins,
  });
  const simOptions: SimulationOptions = {
    world: options.world,
    network: options.network,
    controllers: controllersFromAgents(agents),
  };
  return { sim: new Simulation(simOptions), agents };
}

/**
 * Run until the assignment is stable for `stableTicks` or `maxTicks` hit.
 */
export function runAuction(options: AuctionRunOptions): AuctionRunResult {
  const maxTicks = options.maxTicks ?? 200;
  const stableTicks = options.stableTicks ?? 3;
  const { sim, agents } = createAuctionSimulation(options);

  let previous: Map<string, string> | null = null;
  let stableCount = 0;
  let roundsToConverge: number | null = null;
  let assignmentAtConvergence: Map<string, string> | null = null;
  let snapshot = syncAssignmentsToWorld(sim.getState(), agents);

  for (let t = 0; t < maxTicks; t++) {
    snapshot = syncAssignmentsToWorld(sim.step(), agents);
    const assignment = assignmentFromWorldAndAgents(snapshot, agents);

    if (
      previous !== null &&
      assignmentsEqual(assignment, previous) &&
      isConflictFree(agents) &&
      assignment.size > 0
    ) {
      stableCount += 1;
      if (stableCount >= stableTicks && roundsToConverge === null) {
        roundsToConverge = snapshot.world.tick - stableTicks;
        assignmentAtConvergence = new Map(assignment);
        break;
      }
    } else {
      stableCount = 0;
    }
    previous = assignment;
  }

  return {
    snapshot,
    agents,
    assignment: assignmentAtConvergence ?? assignmentFromWorldAndAgents(snapshot, agents),
    converged: roundsToConverge !== null,
    roundsToConverge,
  };
}

/** Bundle claims plus already-collected tasks. */
export function assignmentFromWorldAndAgents(
  snapshot: SimulationSnapshot,
  agents: Map<string, CbbaAgent>,
): Map<string, string> {
  const assignment = assignmentFromAgents(agents);
  for (const task of snapshot.world.tasks) {
    if (task.collectedBy !== null && !assignment.has(task.id)) {
      assignment.set(task.id, task.collectedBy);
    }
  }
  return assignment;
}
