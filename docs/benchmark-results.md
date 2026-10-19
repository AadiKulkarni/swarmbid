# SwarmBid benchmark results

Settings: tasks = 2× robots, bundle size 3, 20 seeds per cell,
drop rates {0, 0.1, 0.3}, MILP timeout 3000ms
(models with robots×tasks > 1200 are marked timeout without solving).

| Robots | Tasks | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages sent |
|-------:|------:|----------:|-----------------------:|------------------------:|-------------------:|
| 10 | 20 | 0 | 99.5% | 10.1 | 131 |
| 10 | 20 | 0.1 | 99.6% | 13.2 | 162 |
| 10 | 20 | 0.3 | 99.4% | 14.6 | 176 |
| 25 | 50 | 0 | timeout | 16.3 | 483 |
| 25 | 50 | 0.1 | timeout | 19.6 | 565 |
| 25 | 50 | 0.3 | timeout | 20.1 | 578 |
| 50 | 100 | 0 | timeout | 17.6 | 1030 |
| 50 | 100 | 0.1 | timeout | 18.8 | 1088 |
| 50 | 100 | 0.3 | timeout | 19.8 | 1140 |

## Notes

- % of MILP optimal compares the CBBA assignment score (sum of reward − Manhattan)
  to the centralized MILP objective with the same per-robot capacity.
- Rounds to converge = ticks until the assignment stayed stable for 3 ticks.
- Cells marked `timeout` skipped or overran the MILP budget; auction metrics still run.
