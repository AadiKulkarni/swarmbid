import type { Metrics } from "@swarmbid/sim";

interface Props {
  metrics: Metrics;
  milpObjective: number;
  percentOfOptimal: number | null;
  tick: number;
}

export function MetricsPanel({ metrics, milpObjective, percentOfOptimal, tick }: Props) {
  return (
    <aside className="side">
      <h2>Live metrics</h2>
      <div className="metric">
        <span>Tick</span>
        <strong>{tick}</strong>
      </div>
      <div className="metric">
        <span>Reward collected</span>
        <strong>{metrics.totalRewardCollected}</strong>
      </div>
      <div className="metric">
        <span>Double-assigned</span>
        <strong>{metrics.tasksDoubleAssigned}</strong>
      </div>
      <div className="metric">
        <span>Unassigned</span>
        <strong>{metrics.tasksUnassigned}</strong>
      </div>
      <div className="metric">
        <span>Messages sent</span>
        <strong>{metrics.messagesSent}</strong>
      </div>
      <div className="metric">
        <span>Time to converge</span>
        <strong>{metrics.timeToConverge ?? "—"}</strong>
      </div>
      <div className="metric">
        <span>MILP objective</span>
        <strong>{milpObjective.toFixed(1)}</strong>
      </div>
      <div className="metric highlight">
        <span>% of MILP optimal</span>
        <strong>
          {percentOfOptimal === null ? "—" : `${percentOfOptimal.toFixed(1)}%`}
        </strong>
      </div>
    </aside>
  );
}
