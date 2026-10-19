/**
 * Brute-force optimal path-score assignment for tiny worlds (ground truth).
 */

import { pathScore, type TaskState, type WorldState } from "@swarmbid/sim";

export interface BruteResult {
  assignment: Map<string, string>;
  paths: Map<string, string[]>;
  objective: number;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (const p of permutations([...items.slice(0, i), ...items.slice(i + 1)])) {
      out.push([items[i]!, ...p]);
    }
  }
  return out;
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, prefix: T[]) => {
    if (prefix.length === k) {
      out.push([...prefix]);
      return;
    }
    for (let i = start; i <= items.length - (k - prefix.length); i++) {
      prefix.push(items[i]!);
      rec(i + 1, prefix);
      prefix.pop();
    }
  };
  rec(0, []);
  return out;
}

/**
 * Enumerate all conflict-free assignments of ordered paths with |path| ≤ L
 * and return the maximum total pathScore.
 */
export function bruteForceOptimal(
  world: WorldState,
  maxBundleSize: number,
): BruteResult {
  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);
  const L = maxBundleSize;

  // Precompute every (robot, ordered path) option including empty.
  type Opt = { robotId: string; path: TaskState[]; score: number };
  const optionsByRobot = new Map<string, Opt[]>();
  for (const robot of robots) {
    const opts: Opt[] = [{ robotId: robot.id, path: [], score: 0 }];
    for (let k = 1; k <= Math.min(L, tasks.length); k++) {
      for (const subset of combinations(tasks, k)) {
        for (const order of permutations(subset)) {
          opts.push({
            robotId: robot.id,
            path: order,
            score: pathScore(robot.position, order, robot.speed),
          });
        }
      }
    }
    optionsByRobot.set(robot.id, opts);
  }

  let bestScore = -Infinity;
  let bestPaths = new Map<string, string[]>();
  let bestAssignment = new Map<string, string>();

  const robotList = [...robots];
  const search = (idx: number, used: Set<string>, score: number, paths: Map<string, string[]>) => {
    if (idx === robotList.length) {
      if (score > bestScore) {
        bestScore = score;
        bestPaths = new Map(paths);
        const assignment = new Map<string, string>();
        for (const [robotId, pathIds] of paths) {
          for (const taskId of pathIds) {
            assignment.set(taskId, robotId);
          }
        }
        bestAssignment = assignment;
      }
      return;
    }
    const robot = robotList[idx]!;
    for (const opt of optionsByRobot.get(robot.id) ?? []) {
      if (opt.path.some((t) => used.has(t.id))) {
        continue;
      }
      const nextUsed = new Set(used);
      for (const t of opt.path) {
        nextUsed.add(t.id);
      }
      const nextPaths = new Map(paths);
      nextPaths.set(robot.id, opt.path.map((t) => t.id));
      search(idx + 1, nextUsed, score + opt.score, nextPaths);
    }
  };

  search(0, new Set(), 0, new Map());

  return {
    assignment: bestAssignment,
    paths: bestPaths,
    objective: bestScore === -Infinity ? 0 : bestScore,
  };
}
