import { useState } from "react";
import { Controls } from "./components/Controls";
import { MetricsPanel } from "./components/MetricsPanel";
import { WorldCanvas } from "./components/WorldCanvas";
import { useSimulation, type SimControls } from "./hooks/useSimulation";

const INITIAL: SimControls = {
  seed: 42,
  robotCount: 6,
  taskCount: 8,
  dropRate: 0.1,
  delay: 1,
  partitionsEnabled: false,
};

export function App() {
  const [controls, setControls] = useState<SimControls>(INITIAL);
  const sim = useSimulation(controls);

  return (
    <div className="app">
      <header>
        <h1>SwarmBid</h1>
        <p>Deterministic multi-robot auction simulation</p>
      </header>
      <div className="main">
        <Controls
          controls={controls}
          onChange={setControls}
          playing={sim.playing}
          onPlayPause={() => sim.setPlaying(!sim.playing)}
          onStep={sim.step}
          onReplay={sim.replay}
        />
        <WorldCanvas snapshot={sim.snapshot} />
      </div>
      <MetricsPanel
        metrics={sim.snapshot.metrics}
        milpObjective={sim.milpObjective}
        percentOfOptimal={sim.percentOfOptimal}
        tick={sim.snapshot.world.tick}
      />
    </div>
  );
}
