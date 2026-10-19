/**
 * Owns Simulation lifecycle, play/pause/step/replay, and MILP baseline %.
 */

import { solveAssignment } from "@swarmbid/baseline";
import {
  idleController,
  Simulation,
  type Metrics,
  type NetworkConfig,
  type SimulationSnapshot,
  type WorldConfig,
} from "@swarmbid/sim";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SimControls {
  seed: number;
  robotCount: number;
  taskCount: number;
  dropRate: number;
  /** Used as both min and max delay for the slider. */
  delay: number;
  partitionsEnabled: boolean;
}

export interface SimView {
  snapshot: SimulationSnapshot;
  milpObjective: number;
  percentOfOptimal: number | null;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  step: () => void;
  reset: () => void;
  replay: () => void;
}

function buildControllers(robotCount: number) {
  const map = new Map<string, typeof idleController>();
  for (let i = 0; i < robotCount; i++) {
    map.set(`r${i}`, idleController);
  }
  return map;
}

function buildNetwork(controls: SimControls): Partial<NetworkConfig> {
  const partitions: string[][] = [];
  if (controls.partitionsEnabled && controls.robotCount >= 2) {
    const mid = Math.ceil(controls.robotCount / 2);
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < controls.robotCount; i++) {
      (i < mid ? a : b).push(`r${i}`);
    }
    partitions.push(a, b);
  }

  return {
    dropRate: controls.dropRate,
    minDelay: controls.delay,
    maxDelay: controls.delay,
    allowReorder: controls.delay > 0,
    partitions,
  };
}

function createSim(controls: SimControls): Simulation {
  const world: WorldConfig = {
    width: 20,
    height: 20,
    robotCount: controls.robotCount,
    taskCount: controls.taskCount,
    seed: controls.seed,
  };
  return new Simulation({
    world,
    network: buildNetwork(controls),
    controllers: buildControllers(controls.robotCount),
  });
}

function percentOfOptimal(metrics: Metrics, milpObjective: number): number | null {
  if (milpObjective <= 0) {
    return null;
  }
  // Until auction collects reward, compare collected reward to MILP objective.
  return (metrics.totalRewardCollected / milpObjective) * 100;
}

export function useSimulation(controls: SimControls): SimView {
  const simRef = useRef<Simulation | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => {
    const sim = createSim(controls);
    simRef.current = sim;
    return sim.getState();
  });
  const [playing, setPlaying] = useState(false);
  const controlsKey = useMemo(
    () =>
      JSON.stringify({
        seed: controls.seed,
        robotCount: controls.robotCount,
        taskCount: controls.taskCount,
        dropRate: controls.dropRate,
        delay: controls.delay,
        partitionsEnabled: controls.partitionsEnabled,
      }),
    [controls],
  );

  const milpObjective = useMemo(() => {
    const result = solveAssignment(snapshot.world);
    return result.objective;
  }, [snapshot.world]);

  const reset = useCallback(() => {
    const parsed = JSON.parse(controlsKey) as SimControls;
    const sim = createSim(parsed);
    simRef.current = sim;
    setSnapshot(sim.getState());
    setPlaying(false);
  }, [controlsKey]);

  useEffect(() => {
    reset();
  }, [reset]);

  const step = useCallback(() => {
    const sim = simRef.current;
    if (!sim) {
      return;
    }
    setSnapshot(sim.step());
  }, []);

  const replay = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = window.setInterval(() => {
      step();
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, step]);

  return {
    snapshot,
    milpObjective,
    percentOfOptimal: percentOfOptimal(snapshot.metrics, milpObjective),
    playing,
    setPlaying,
    step,
    reset,
    replay,
  };
}
