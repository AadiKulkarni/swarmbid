/**
 * Simulation metrics: reward, assignment conflicts, messaging, convergence.
 *
 * Call `updateMetrics` after each tick with the current world and running
 * counters. `timeToConverge` latches on the first tick where the assignment
 * map is identical to the previous tick and every reachable task is claimed.
 */

import type { Metrics, WorldState } from "./types.js";

export function emptyMetrics(): Metrics {
  return {
    totalRewardCollected: 0,
    tasksDoubleAssigned: 0,
    tasksUnassigned: 0,
    messagesSent: 0,
    timeToConverge: null,
  };
}

/** Snapshot of robotId -> assignedTaskId for convergence checks. */
export function assignmentMap(world: WorldState): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const robot of world.robots) {
    map.set(robot.id, robot.assignedTaskId);
  }
  return map;
}

function mapsEqual(
  a: Map<string, string | null>,
  b: Map<string, string | null>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Count tasks claimed by more than one robot (conflicting assignments).
 */
export function countDoubleAssigned(world: WorldState): number {
  const counts = new Map<string, number>();
  for (const robot of world.robots) {
    if (robot.assignedTaskId === null) {
      continue;
    }
    counts.set(robot.assignedTaskId, (counts.get(robot.assignedTaskId) ?? 0) + 1);
  }
  let doubles = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      doubles += 1;
    }
  }
  return doubles;
}

/** Tasks with no robot assignment and not yet collected. */
export function countUnassigned(world: WorldState): number {
  const assigned = new Set(
    world.robots.map((r) => r.assignedTaskId).filter((id): id is string => id !== null),
  );
  return world.tasks.filter((t) => t.collectedBy === null && !assigned.has(t.id)).length;
}

export function totalRewardCollected(world: WorldState): number {
  return world.tasks
    .filter((t) => t.collectedBy !== null)
    .reduce((sum, t) => sum + t.reward, 0);
}

export interface MetricsUpdateInput {
  world: WorldState;
  messagesSent: number;
  previousAssignment: Map<string, string | null> | null;
  previousMetrics: Metrics;
}

/**
 * Derive the latest metrics snapshot from world state and running counters.
 */
export function updateMetrics(input: MetricsUpdateInput): {
  metrics: Metrics;
  assignment: Map<string, string | null>;
} {
  const assignment = assignmentMap(input.world);
  const metrics: Metrics = {
    totalRewardCollected: totalRewardCollected(input.world),
    tasksDoubleAssigned: countDoubleAssigned(input.world),
    tasksUnassigned: countUnassigned(input.world),
    messagesSent: input.messagesSent,
    timeToConverge: input.previousMetrics.timeToConverge,
  };

  if (
    metrics.timeToConverge === null &&
    input.previousAssignment !== null &&
    mapsEqual(assignment, input.previousAssignment) &&
    metrics.tasksDoubleAssigned === 0
  ) {
    metrics.timeToConverge = input.world.tick;
  }

  return { metrics, assignment };
}
