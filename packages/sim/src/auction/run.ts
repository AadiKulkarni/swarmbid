/**
 * Helpers to run CBBA auctions to convergence for tests and benchmarks.
 */

import { Simulation, type SimulationOptions, type SimulationSnapshot } from "../simulation.js";
import type { NetworkConfig, WorldConfig } from "../types.js";
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

  return {
    ...snapshot,
    world: { ...snapshot.world, robots },
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
  const agents = createCbbaAgents(ids, {
    maxBundleSize: options.maxBundleSize ?? DEFAULT_MAX_BUNDLE_SIZE,
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
  let snapshot = syncAssignmentsToWorld(sim.getState(), agents);

  for (let t = 0; t < maxTicks; t++) {
    snapshot = syncAssignmentsToWorld(sim.step(), agents);
    const assignment = assignmentFromAgents(agents);

    if (previous !== null && assignmentsEqual(assignment, previous)) {
      stableCount += 1;
      if (stableCount >= stableTicks && roundsToConverge === null) {
        roundsToConverge = snapshot.world.tick - stableTicks;
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
    assignment: assignmentFromAgents(agents),
    converged: roundsToConverge !== null,
    roundsToConverge,
  };
}
