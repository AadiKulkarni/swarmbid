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
}

resetHighsLoader();

self.onmessage = (event: MessageEvent<MilpRequest>) => {
  const { id, world, maxTasksPerRobot } = event.data;
  void (async () => {
    try {
      const result = await solveAssignment(world, {
        maxTasksPerRobot,
        timeLimitSec: 30,
        // Served from packages/web/public/highs.wasm (copied at build time).
        locateFile: (file) =>
          file.endsWith(".wasm") ? `${self.location.origin}/highs.wasm` : file,
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
      });
    }
  })();
};
