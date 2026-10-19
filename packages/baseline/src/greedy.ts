/**
 * Greedy path construction for MIP warm-starts and feasible fallbacks.
 * Same marginal-insertion score CBBA uses (bestInsertion / pathScore).
 */

import {
  bestInsertion,
  pathScore,
  type TaskState,
  type WorldState,
} from "@swarmbid/sim";

export interface GreedyResult {
  /** Ordered task ids per robot. */
  paths: Map<string, string[]>;
  /** taskId → robotId */
  assignment: Map<string, string>;
  score: number;
}

/**
 * Repeatedly insert the globally best positive-marginal (robot, task) pair
 * until no improving insertion remains under the bundle-size cap.
 */
export function greedyPaths(world: WorldState, maxBundleSize: number): GreedyResult {
  const tasks = world.tasks.filter((t) => t.collectedBy === null);
  const remaining = new Set(tasks.map((t) => t.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const paths = new Map<string, string[]>(world.robots.map((r) => [r.id, []]));

  for (;;) {
    let best: {
      robotId: string;
      taskId: string;
      insertIndex: number;
      marginal: number;
    } | null = null;

    for (const robot of world.robots) {
      const ids = paths.get(robot.id)!;
      if (ids.length >= maxBundleSize) {
        continue;
      }
      const path: TaskState[] = ids.map((id) => taskById.get(id)!);
      for (const taskId of remaining) {
        const task = taskById.get(taskId)!;
        const { marginal, insertIndex } = bestInsertion(
          robot.position,
          path,
          task,
          robot.speed,
        );
        if (marginal > (best?.marginal ?? 0)) {
          best = { robotId: robot.id, taskId, insertIndex, marginal };
        }
      }
    }

    if (!best || best.marginal <= 0) {
      break;
    }
    paths.get(best.robotId)!.splice(best.insertIndex, 0, best.taskId);
    remaining.delete(best.taskId);
  }

  const assignment = new Map<string, string>();
  let score = 0;
  for (const robot of world.robots) {
    const ids = paths.get(robot.id)!;
    for (const id of ids) {
      assignment.set(id, robot.id);
    }
    const path = ids.map((id) => taskById.get(id)!);
    score += pathScore(robot.position, path, robot.speed);
  }

  return { paths, assignment, score };
}
