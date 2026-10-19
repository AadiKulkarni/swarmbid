/**
 * Shared path-score helpers — same objective CBBA uses in @swarmbid/sim.
 */

import { manhattan, pathScore, type TaskState, type Vec2, type WorldState } from "@swarmbid/sim";

/**
 * Valid upper bound on the path-score optimum: each task contributes at most
 * max_r (reward − d(r,t)), since Manhattan obeys the triangle inequality so a
 * task's arrival time is never less than the direct travel from its robot.
 */
export function pathScoreUpperBound(world: WorldState): number {
  const tasks = world.tasks.filter((t) => t.collectedBy === null);
  let ub = 0;
  for (const task of tasks) {
    let best = 0;
    for (const robot of world.robots) {
      const d =
        manhattan(robot.position, task.position) / Math.max(1, robot.speed);
      best = Math.max(best, task.reward - d);
    }
    ub += Math.max(0, best);
  }
  return ub;
}

export function travelTime(from: Vec2, to: Vec2, speed: number): number {
  return manhattan(from, to) / Math.max(1, speed);
}

/** Best visit order score for an unordered task set. */
export function bestPathScore(
  start: Vec2,
  tasks: readonly TaskState[],
  speed: number,
): { score: number; path: TaskState[] } {
  if (tasks.length === 0) {
    return { score: 0, path: [] };
  }
  if (tasks.length === 1) {
    return { score: pathScore(start, tasks, speed), path: [...tasks] };
  }

  let bestScore = -Infinity;
  let bestPath: TaskState[] = [];

  const permute = (remaining: TaskState[], prefix: TaskState[]) => {
    if (remaining.length === 0) {
      const score = pathScore(start, prefix, speed);
      if (score > bestScore) {
        bestScore = score;
        bestPath = [...prefix];
      }
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining[i]!;
      permute(
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
        [...prefix, next],
      );
    }
  };
  permute([...tasks], []);
  return { score: bestScore, path: bestPath };
}

/**
 * Score a task→robot assignment using the best path order per robot
 * (exact CBBA path-score objective for that packing).
 */
export function scoreAssignment(
  world: WorldState,
  assignment: Map<string, string>,
): number {
  const byRobot = new Map<string, TaskState[]>();
  const taskById = new Map(world.tasks.map((t) => [t.id, t]));
  for (const [taskId, robotId] of assignment) {
    const task = taskById.get(taskId);
    if (!task) {
      continue;
    }
    const list = byRobot.get(robotId) ?? [];
    list.push(task);
    byRobot.set(robotId, list);
  }

  let total = 0;
  for (const robot of world.robots) {
    const tasks = byRobot.get(robot.id) ?? [];
    if (tasks.length === 0) {
      continue;
    }
    total += bestPathScore(robot.position, tasks, robot.speed).score;
  }
  return total;
}

/**
 * Score explicit ordered paths (CBBA's actual paths at convergence).
 */
export function scorePaths(
  world: WorldState,
  paths: Map<string, string[]>,
): number {
  const taskById = new Map(world.tasks.map((t) => [t.id, t]));
  let total = 0;
  for (const robot of world.robots) {
    const ids = paths.get(robot.id) ?? [];
    const tasks = ids
      .map((id) => taskById.get(id))
      .filter((t): t is TaskState => t !== undefined);
    total += pathScore(robot.position, tasks, robot.speed);
  }
  return total;
}
