/**
 * Web worker: HiGHS path-score MILP off the UI thread.
 */

import { resetHighsLoader, solveAssignment } from "@swarmbid/baseline";
import type { WorldState } from "@swarmbid/sim";

export interface MilpRequest {
  id: number;
  world: WorldState;
  maxTasksPerRobot: number;
}

export interface MilpResponse {
  id: number;
  objective: number;
  dualBound: number;
  timedOut: boolean;
  provenOptimal: boolean;
  feasible: boolean;
  error?: string;
}

resetHighsLoader();

/** Prefer the Vite-copied /highs.wasm from public/; fall back to same-origin. */
function locateFile(file: string): string {
  if (file.endsWith(".wasm")) {
    return new URL("/highs.wasm", self.location.origin).href;
  }
  return file;
}

self.onmessage = (event: MessageEvent<MilpRequest>) => {
  const { id, world, maxTasksPerRobot } = event.data;
  void (async () => {
    try {
      const result = await solveAssignment(world, {
        maxTasksPerRobot,
        timeLimitSec: 30,
        locateFile,
      });
      const response: MilpResponse = {
        id,
        objective: result.objective,
        dualBound: result.dualBound,
        timedOut: result.timedOut,
        provenOptimal: result.provenOptimal,
        feasible: result.feasible,
      };
      self.postMessage(response);
    } catch (err) {
      self.postMessage({
        id,
        objective: 0,
        dualBound: 0,
        timedOut: true,
        provenOptimal: false,
        feasible: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies MilpResponse);
    }
  })();
};
