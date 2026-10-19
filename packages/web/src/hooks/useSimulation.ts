/**
 * Owns Simulation lifecycle, play/pause/step/replay, and live auction metrics.
 */

import { scorePaths } from "@swarmbid/baseline";
import {
  createAuctionSimulation,
  syncAssignmentsToWorld,
  type CbbaAgent,
  type NetworkConfig,
  type Simulation,
  type SimulationSnapshot,
  type WorldConfig,
} from "@swarmbid/sim";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMilpWorker } from "./useMilpWorker";

export interface SimControls {
  seed: number;
  robotCount: number;
  taskCount: number;
  dropRate: number;
  delay: number;
  partitionsEnabled: boolean;
}

export interface SimView {
  snapshot: SimulationSnapshot;
  agents: Map<string, CbbaAgent>;
  milpObjective: number | null;
  milpDualBound: number | null;
  milpProvenOptimal: boolean;
  milpLoading: boolean;
  milpTimedOut: boolean;
  percentOfOptimal: number | null;
  percentLabel: string;
  auctionScore: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  step: () => void;
  reset: () => void;
  replay: () => void;
  hoveredRobotId: string | null;
  setHoveredRobotId: (id: string | null) => void;
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

function createAuction(controls: SimControls): {
  sim: Simulation;
  agents: Map<string, CbbaAgent>;
} {
  const world: WorldConfig = {
    width: 20,
    height: 20,
    robotCount: controls.robotCount,
    taskCount: controls.taskCount,
    seed: controls.seed,
  };
  return createAuctionSimulation({
    world,
    network: buildNetwork(controls),
    maxBundleSize: 3,
  });
}

function percentAgainstBound(
  auctionScore: number,
  dualBound: number | null,
  provenOptimal: boolean,
): { pct: number | null; label: string } {
  if (dualBound === null || dualBound <= 0) {
    return { pct: null, label: "—" };
  }
  const pct = (auctionScore / dualBound) * 100;
  return {
    pct,
    label: provenOptimal ? `${pct.toFixed(1)}%` : `≥${pct.toFixed(1)}%`,
  };
}

export function useSimulation(controls: SimControls): SimView {
  const simRef = useRef<Simulation | null>(null);
  const agentsRef = useRef<Map<string, CbbaAgent>>(new Map());
  const [agents, setAgents] = useState<Map<string, CbbaAgent>>(() => {
    const { sim, agents: initial } = createAuction(controls);
    simRef.current = sim;
    agentsRef.current = initial;
    return initial;
  });
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    syncAssignmentsToWorld(simRef.current!.getState(), agentsRef.current),
  );
  const [playing, setPlaying] = useState(false);
  const [hoveredRobotId, setHoveredRobotId] = useState<string | null>(null);

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

  const milp = useMilpWorker(snapshot.world, 3);

  const auctionScore = useMemo(() => {
    const paths = new Map<string, string[]>();
    for (const agent of agents.values()) {
      paths.set(agent.robotId, agent.getPath());
    }
    return scorePaths(snapshot.world, paths);
  }, [snapshot.world, agents]);

  const reset = useCallback(() => {
    const parsed = JSON.parse(controlsKey) as SimControls;
    const { sim, agents: next } = createAuction(parsed);
    simRef.current = sim;
    agentsRef.current = next;
    setAgents(next);
    setSnapshot(syncAssignmentsToWorld(sim.getState(), next));
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
    const next = syncAssignmentsToWorld(sim.step(), agentsRef.current);
    setSnapshot(next);
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

  const pct = percentAgainstBound(
    auctionScore,
    milp.dualBound,
    milp.provenOptimal,
  );

  return {
    snapshot,
    agents,
    milpObjective: milp.objective,
    milpDualBound: milp.dualBound,
    milpProvenOptimal: milp.provenOptimal,
    milpLoading: milp.loading,
    milpTimedOut: milp.timedOut,
    percentOfOptimal: pct.pct,
    percentLabel: pct.label,
    auctionScore,
    playing,
    setPlaying,
    step,
    reset,
    replay,
    hoveredRobotId,
    setHoveredRobotId,
  };
}
