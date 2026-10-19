/**
 * Runs solveAssignment in a web worker; recomputes once per world seed/layout.
 */

import type { WorldState } from "@swarmbid/sim";
import { useEffect, useRef, useState } from "react";
import type { MilpRequest, MilpResponse } from "../workers/milp.worker";

export interface MilpStatus {
  objective: number | null;
  timedOut: boolean;
  loading: boolean;
}

function worldKey(world: WorldState): string {
  return JSON.stringify({
    seed: world.seed,
    width: world.width,
    height: world.height,
    robots: world.robots.map((r) => [r.id, r.position.x, r.position.y]),
    tasks: world.tasks.map((t) => [t.id, t.position.x, t.position.y, t.reward]),
  });
}

export function useMilpWorker(world: WorldState, maxTasksPerRobot = 3): MilpStatus {
  const [status, setStatus] = useState<MilpStatus>({
    objective: null,
    timedOut: false,
    loading: true,
  });
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const key = worldKey(world);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/milp.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }
    const id = ++reqId.current;
    setStatus((s) => ({ ...s, loading: true }));

    const onMessage = (event: MessageEvent<MilpResponse>) => {
      if (event.data.id !== id) {
        return;
      }
      setStatus({
        objective: event.data.timedOut ? null : event.data.objective,
        timedOut: event.data.timedOut,
        loading: false,
      });
    };
    worker.addEventListener("message", onMessage);

    const request: MilpRequest = {
      id,
      world,
      maxTasksPerRobot,
    };
    worker.postMessage(request);

    return () => worker.removeEventListener("message", onMessage);
  }, [key, maxTasksPerRobot, world]);

  return status;
}
