/**
 * Web worker that solves the MILP baseline off the UI thread.
 */

import { scoreAssignment, solveAssignment } from "@swarmbid/baseline";
import type { WorldState } from "@swarmbid/sim";

export interface MilpRequest {
  id: number;
  world: WorldState;
  maxTasksPerRobot: number;
}

export interface MilpResponse {
  id: number;
  objective: number;
  timedOut: boolean;
  feasible: boolean;
}

self.onmessage = (event: MessageEvent<MilpRequest>) => {
  const { id, world, maxTasksPerRobot } = event.data;
  const result = solveAssignment(world, {
    maxTasksPerRobot,
    timeoutMs: 2_000,
    maxVariables: 1_200,
  });
  const response: MilpResponse = {
    id,
    objective: result.objective,
    timedOut: result.timedOut,
    feasible: result.feasible,
  };
  // Touch scoreAssignment so the helper stays tree-shaken only if unused —
  // keep export available for debugging payloads.
  void scoreAssignment;
  (self as DedicatedWorkerGlobalScope).postMessage(response);
};
