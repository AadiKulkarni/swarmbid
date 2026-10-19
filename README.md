# SwarmBid

**Live demo:** <DEMO_URL>

SwarmBid is a deterministic multi-robot task-allocation simulator: robots greedily build task bundles with marginal path-score bids, then resolve conflicts with CBBA-style consensus over a lossy, delayed, optionally partitioned network, while a centralized MILP solver provides the optimal baseline for comparison.

## Results

From `docs/benchmark-results.md` (20 seeds per cell, bundle size 3, tasks = 2× robots):

| Robots | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages |
|-------:|----------:|-----------------------:|------------------------:|--------------:|
| 10 | 0 | 99.5% | 10.1 | 131 |
| 10 | 0.1 | 99.6% | 13.2 | 162 |
| 10 | 0.3 | 99.4% | 14.6 | 176 |
| 25 | 0 / 0.1 / 0.3 | timeout | 16.3 / 19.6 / 20.1 | 483 / 565 / 578 |
| 50 | 0 / 0.1 / 0.3 | timeout | 17.6 / 18.8 / 19.8 | 1030 / 1088 / 1140 |

At 10 robots, CBBA stays within about 1% of the MILP objective even at 30% message drop. Larger fleets still converge in ~20 rounds; MILP is marked `timeout` once robots×tasks exceeds the solver budget.

## How to run

```bash
pnpm install
pnpm test
pnpm bench
pnpm --filter @swarmbid/web dev
```

| Script | Description |
|--------|-------------|
| `pnpm test` | Vitest across all packages |
| `pnpm build` | Typecheck / build all packages |
| `pnpm lint` | ESLint |
| `pnpm bench` | CBBA vs MILP benchmark → `docs/benchmark-results.md` |
| `pnpm dev` | Vite web UI |

Requires Node 20+ and pnpm 9.6.

## How it works

Each robot scores a candidate task as the marginal gain in path score from inserting that task at the best point in its current route (reward minus cumulative travel time). Bundles grow greedily up to a configurable size (default 3). Robots broadcast winning-bid vectors, winner ids, and peer timestamps; on each message they apply CBBA update/reset/leave rules so only fresher information overwrites local beliefs. When a robot is outbid on a bundle task, it releases that task and every task added after it, because later marginal scores assumed the earlier task was still on the path. Timestamps ensure delayed or reordered messages cannot clobber newer consensus state. A seeded PRNG drives placement, drops, delays, and reorder so any run is fully replayable.

## Architecture

| Package | Role |
|---------|------|
| `@swarmbid/sim` | Seeded PRNG, grid world, message bus, CBBA auction, metrics |
| `@swarmbid/baseline` | Centralized MILP assignment (`javascript-lp-solver`) |
| `@swarmbid/web` | Vite + React canvas UI with live metrics and MILP % |

## Known limitations

- Path scores used for bidding are frozen at each robot’s initial position; movement does not reprice open auctions mid-run.
- The MILP baseline uses pairwise (reward − distance) utilities, not the full path-coupled CBBA score, so “% of optimal” is an approximate efficiency ratio.
- Large instances (roughly robots×tasks > 1200) skip or time out the MILP; those benchmark cells are marked `timeout`.
- Permanent network partitions prevent global consensus by design; the property tests assume a connected (non-partitioned) graph.
- Bundle construction is greedy CBBA, not an exhaustive combinatorial auction, so solution quality is not guaranteed optimal even with perfect communication.
