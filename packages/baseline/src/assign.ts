/**
 * Centralized MILP task assignment baseline.
 *
 * Formulates the robot–task assignment as a binary integer program:
 * maximize sum_i sum_j u_ij * x_ij subject to each task chosen at most once
 * and each robot chosen at most `maxTasksPerRobot` times (default 3, matching
 * CBBA L_t). Utility u_ij = task.reward − Manhattan distance (floored at 0).
 */

import type { WorldState } from "@swarmbid/sim";
import { manhattan } from "@swarmbid/sim";
import solver from "javascript-lp-solver";

export interface SolveOptions {
  /** Max tasks assigned to one robot (CBBA bundle capacity). Default 3. */
  maxTasksPerRobot?: number;
  /**
   * Wall-clock budget in ms. Because javascript-lp-solver is synchronous,
   * oversized models are rejected up front; if a solve still overruns the
   * budget the result is marked timedOut.
   */
  timeoutMs?: number;
  /** Skip the solver when (#robots × #tasks) exceeds this. Default 1500. */
  maxVariables?: number;
}

export interface AssignmentResult {
  /** taskId -> robotId */
  assignment: Map<string, string>;
  /** Optimal objective value (sum of utilities). */
  objective: number;
  feasible: boolean;
  timedOut: boolean;
}

function utility(reward: number, distance: number): number {
  return Math.max(0, reward - distance);
}

/**
 * Score an assignment with the same utility the MILP optimizes.
 */
export function scoreAssignment(
  world: WorldState,
  assignment: Map<string, string>,
): number {
  let total = 0;
  const robots = new Map(world.robots.map((r) => [r.id, r]));
  const tasks = new Map(world.tasks.map((t) => [t.id, t]));
  for (const [taskId, robotId] of assignment) {
    const task = tasks.get(taskId);
    const robot = robots.get(robotId);
    if (!task || !robot) {
      continue;
    }
    total += utility(task.reward, manhattan(robot.position, task.position));
  }
  return total;
}

/**
 * Solve the optimal centralized assignment for the given world snapshot.
 */
export function solveAssignment(
  world: WorldState,
  options: SolveOptions = {},
): AssignmentResult {
  const maxTasksPerRobot = options.maxTasksPerRobot ?? 3;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxVariables = options.maxVariables ?? 1_500;

  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);

  if (robots.length === 0 || tasks.length === 0) {
    return { assignment: new Map(), objective: 0, feasible: true, timedOut: false };
  }

  if (robots.length * tasks.length > maxVariables) {
    return { assignment: new Map(), objective: 0, feasible: false, timedOut: true };
  }

  const started = Date.now();

  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, number> = {};
  const constraints: Record<string, { max?: number; min?: number }> = {};

  for (const robot of robots) {
    constraints[`robot_${robot.id}`] = { max: maxTasksPerRobot };
  }
  for (const task of tasks) {
    constraints[`task_${task.id}`] = { max: 1 };
  }

  for (const robot of robots) {
    for (const task of tasks) {
      const key = `x_${robot.id}_${task.id}`;
      const u = utility(task.reward, manhattan(robot.position, task.position));
      variables[key] = {
        profit: u,
        [`robot_${robot.id}`]: 1,
        [`task_${task.id}`]: 1,
      };
      ints[key] = 1;
    }
  }

  const result = solver.Solve({
    optimize: "profit",
    opType: "max",
    constraints,
    variables,
    ints,
  });

  if (Date.now() - started > timeoutMs) {
    return { assignment: new Map(), objective: 0, feasible: false, timedOut: true };
  }

  const assignment = new Map<string, string>();
  if (result.feasible) {
    for (const robot of robots) {
      for (const task of tasks) {
        const key = `x_${robot.id}_${task.id}`;
        const value = result[key];
        if (typeof value === "number" && value >= 0.5) {
          assignment.set(task.id, robot.id);
        }
      }
    }
  }

  return {
    assignment,
    objective: typeof result.result === "number" ? result.result : 0,
    feasible: Boolean(result.feasible),
    timedOut: false,
  };
}
