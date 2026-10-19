# SwarmBid benchmark results

Settings: tasks = 2× robots, bundle size 3, 20 seeds per cell,
drop rates {0, 0.1, 0.3}, HiGHS time limit 30s.
MILP maximizes the same path-score objective as CBBA (set-packing / arc model).
Auction runs are plan-only (no movement/collection) so paths match the static MILP.
When the solver hits the time limit, “% of optimal” is reported against the MIP
dual bound (tightened by an analytical upper bound) as `≥X%`.

| Robots | Tasks | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages sent |
|-------:|------:|----------:|-----------------------:|------------------------:|-------------------:|
| 10 | 20 | 0 | 84.9% | 7.0 | 101 |
| 10 | 20 | 0.1 | 85.0% | 9.3 | 123 |
| 10 | 20 | 0.3 | 85.0% | 11.7 | 147 |
| 25 | 50 | 0 | ≥85.6% | 9.4 | 444 |
| 25 | 50 | 0.1 | ≥85.6% | 12.9 | 529 |
| 25 | 50 | 0.3 | ≥85.6% | 15.4 | 715 |
| 50 | 100 | 0 | ≥88.3% | 12.3 | 1488 |
| 50 | 100 | 0.1 | ≥88.2% | 16.4 | 2025 |
| 50 | 100 | 0.3 | ≥88.2% | 19.9 | 1833 |

## Notes

- Objective: maximize Σ_robots pathScore(start, ordered path), |path| ≤ 3, tasks disjoint.
- pathScore = Σ_j (reward_j − cumulative Manhattan travel time / speed).
- CBBA % uses each robot's ordered path at convergence vs the MILP dual bound.
- `≥X%` means at least one seed hit the HiGHS time limit; X is mean(cbba/dualBound).
