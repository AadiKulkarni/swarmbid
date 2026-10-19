import type { SimControls } from "../hooks/useSimulation";

interface Props {
  controls: SimControls;
  onChange: (next: SimControls) => void;
  playing: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  onReplay: () => void;
}

export function Controls({
  controls,
  onChange,
  playing,
  onPlayPause,
  onStep,
  onReplay,
}: Props) {
  const patch = (partial: Partial<SimControls>) => onChange({ ...controls, ...partial });

  return (
    <div className="controls">
      <div className="control">
        Seed
        <input
          type="number"
          value={controls.seed}
          onChange={(e) => patch({ seed: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="control">
        Robots
        <input
          type="number"
          min={1}
          max={40}
          value={controls.robotCount}
          onChange={(e) => patch({ robotCount: Math.max(1, Number(e.target.value) || 1) })}
        />
      </div>
      <div className="control">
        Tasks
        <input
          type="number"
          min={1}
          max={40}
          value={controls.taskCount}
          onChange={(e) => patch({ taskCount: Math.max(1, Number(e.target.value) || 1) })}
        />
      </div>
      <div className="control">
        Drop rate ({controls.dropRate.toFixed(2)})
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={controls.dropRate}
          onChange={(e) => patch({ dropRate: Number(e.target.value) })}
        />
      </div>
      <div className="control">
        Delay ({controls.delay} ticks)
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={controls.delay}
          onChange={(e) => patch({ delay: Number(e.target.value) })}
        />
      </div>
      <div className="control">
        <label className="row">
          <input
            type="checkbox"
            checked={controls.partitionsEnabled}
            onChange={(e) => patch({ partitionsEnabled: e.target.checked })}
          />
          Partition
        </label>
      </div>
      <div className="buttons">
        <button type="button" className="primary" onClick={onPlayPause}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onStep}>
          Step
        </button>
        <button type="button" onClick={onReplay}>
          Replay
        </button>
      </div>
    </div>
  );
}
