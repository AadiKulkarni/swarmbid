import type { Metrics } from "@swarmbid/sim";

interface Props {
  metrics: Metrics;
  milpObjective: number | null;
  milpLoading: boolean;
  milpTimedOut: boolean;
  percentOfOptimal: number | null;
  auctionScore: number;
  tick: number;
}

export function MetricsPanel({
  metrics,
  milpObjective,
  milpLoading,
  milpTimedOut,
  percentOfOptimal,
  auctionScore,
  tick,
}: Props) {
  let milpLabel = "—";
  if (milpLoading) {
    milpLabel = "solving…";
  } else if (milpTimedOut) {
    milpLabel = "timeout";
  } else if (milpObjective !== null) {
    milpLabel = milpObjective.toFixed(1);
  }

  return (
    <aside className="side">
      <h2>Live metrics</h2>
      <div className="metric">
        <span>Tick</span>
        <strong>{tick}</strong>
      </div>
      <div className="metric">
        <span>Auction score</span>
        <strong>{auctionScore.toFixed(1)}</strong>
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
        <strong>{milpLabel}</strong>
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
