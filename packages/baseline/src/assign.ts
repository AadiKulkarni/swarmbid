/**
 * Centralized MILP task assignment baseline.
 *
 * Formulates the robot–task assignment as a binary integer program:
 * maximize sum_i sum_j u_ij * x_ij subject to each robot and each task
 * being chosen at most once. Utility u_ij = task.reward - Manhattan
 * distance from robot i to task j (floored at 0 so travel never exceeds
 * reward). Uses javascript-lp-solver so the objective is a true MILP
 * optimum for the same world the decentralized auction sees.
 */

import type { WorldState } from "@swarmbid/sim";
import { manhattan } from "@swarmbid/sim";
import solver from "javascript-lp-solver";

export interface AssignmentResult {
  /** taskId -> robotId */
  assignment: Map<string, string>;
  /** Optimal objective value (sum of utilities). */
  objective: number;
  feasible: boolean;
}

function utility(reward: number, distance: number): number {
  return Math.max(0, reward - distance);
}

/**
 * Solve the optimal centralized assignment for the given world snapshot.
 * Only considers uncollected tasks and all robots.
 */
export function solveAssignment(world: WorldState): AssignmentResult {
  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);

  if (robots.length === 0 || tasks.length === 0) {
    return { assignment: new Map(), objective: 0, feasible: true };
  }

  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, number> = {};
  const constraints: Record<string, { max?: number; min?: number }> = {};

  for (const robot of robots) {
    constraints[`robot_${robot.id}`] = { max: 1 };
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
  };
}
