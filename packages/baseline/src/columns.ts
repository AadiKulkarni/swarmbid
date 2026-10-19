/**
 * Column generation for the exact path-score set-packing MILP.
 *
 * Each column is (robot, ordered task path) with |path| ≤ L and objective
 * equal to CBBA pathScore. When all ordered paths exceed a soft limit we
 * emit one column per unordered subset (best permutation) — still exact.
 */

import { pathScore, type WorldState } from "@swarmbid/sim";
import { bestPathScore } from "./score.js";

export interface Column {
  id: string;
  robotId: string;
  taskIds: string[];
  score: number;
}

/** Above this ordered-column estimate, switch to best-perm subsets. */
export const ORDERED_COLUMN_SOFT_LIMIT = 120_000;

/**
 * Above this subset-column estimate, caller should use the arc MILP instead.
 * (~80k keeps 10×20 set-packing tractable in HiGHS WASM; 25×50 needs arc.)
 */
export const SUBSET_COLUMN_HARD_LIMIT = 80_000;

export function estimateOrderedColumns(robots: number, tasks: number, L: number): number {
  let per = 0;
  let falling = 1;
  for (let k = 1; k <= L; k++) {
    falling *= Math.max(0, tasks - k + 1);
    per += falling;
  }
  return robots * per;
}

export function estimateSubsetColumns(robots: number, tasks: number, L: number): number {
  let per = 0;
  let choose = 1;
  for (let k = 1; k <= L; k++) {
    choose = (choose * (tasks - k + 1)) / k;
    per += choose;
  }
  return robots * per;
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

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) {
      out.push([items[i]!, ...p]);
    }
  }
  return out;
}

/**
 * Enumerate feasible columns, or null when the instance is too large for
 * set-packing columns (use arc MILP instead).
 */
export function enumerateColumns(
  world: WorldState,
  maxBundleSize: number,
): { columns: Column[]; mode: "ordered" | "subset" } | null {
  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);
  const R = robots.length;
  const T = tasks.length;
  const L = maxBundleSize;

  if (estimateSubsetColumns(R, T, L) > SUBSET_COLUMN_HARD_LIMIT) {
    return null;
  }

  const useOrdered = estimateOrderedColumns(R, T, L) <= ORDERED_COLUMN_SOFT_LIMIT;
  const columns: Column[] = [];
  let colIndex = 0;

  if (useOrdered) {
    for (const robot of robots) {
      for (let k = 1; k <= L; k++) {
        for (const subset of combinations(tasks, k)) {
          for (const order of permutations(subset)) {
            const score = pathScore(robot.position, order, robot.speed);
            if (score <= 0) {
              continue;
            }
            columns.push({
              id: `c${colIndex++}`,
              robotId: robot.id,
              taskIds: order.map((t) => t.id),
              score,
            });
          }
        }
      }
    }
    return { columns, mode: "ordered" };
  }

  for (const robot of robots) {
    for (let k = 1; k <= L; k++) {
      for (const subset of combinations(tasks, k)) {
        const { score, path } = bestPathScore(robot.position, subset, robot.speed);
        if (score <= 0) {
          continue;
        }
        columns.push({
          id: `c${colIndex++}`,
          robotId: robot.id,
          taskIds: path.map((t) => t.id),
          score,
        });
      }
    }
  }
  return { columns, mode: "subset" };
}

/** Build CPLEX LP text for the set-packing model. */
export function columnsToLp(
  columns: Column[],
  taskIds: string[],
  robotIds: string[],
): string {
  const lines: string[] = [];
  lines.push("Maximize");
  if (columns.length === 0) {
    lines.push(" obj: 0");
  } else {
    lines.push(` obj: ${columns.map((c) => `${c.score} ${c.id}`).join(" + ")}`);
  }
  lines.push("Subject To");
  for (const robotId of robotIds) {
    const cols = columns.filter((c) => c.robotId === robotId).map((c) => c.id);
    lines.push(
      cols.length === 0
        ? ` robot_${robotId}: 0 <= 1`
        : ` robot_${robotId}: ${cols.join(" + ")} <= 1`,
    );
  }
  for (const taskId of taskIds) {
    const cols = columns.filter((c) => c.taskIds.includes(taskId)).map((c) => c.id);
    lines.push(
      cols.length === 0
        ? ` task_${taskId}: 0 <= 1`
        : ` task_${taskId}: ${cols.join(" + ")} <= 1`,
    );
  }
  if (columns.length > 0) {
    lines.push("Binary");
    for (const c of columns) {
      lines.push(` ${c.id}`);
    }
  }
  lines.push("End");
  return lines.join("\n");
}
