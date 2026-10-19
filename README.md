# SwarmBid

**Live demo:** [https://swarmbid-web.vercel.app](https://swarmbid-web.vercel.app)

SwarmBid is a deterministic multi-robot task-allocation simulator: robots greedily build task bundles with marginal path-score bids, then resolve conflicts with CBBA-style consensus over a lossy, delayed, optionally partitioned network, while a centralized MILP solver provides the optimal baseline for comparison.

## Results

From `docs/benchmark-results.md` (20 seeds per cell, bundle size 3, tasks = 2× robots, HiGHS 30s):

| Robots | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages |
|-------:|----------:|-----------------------:|------------------------:|--------------:|
| 10 | 0 | 84.9% | 7.0 | 101 |
| 10 | 0.1 | 85.0% | 9.3 | 123 |
| 10 | 0.3 | 85.0% | 11.7 | 147 |
| 25 | 0 / 0.1 / 0.3 | ≥85.6% / ≥85.6% / ≥85.6% | 9.4 / 12.9 / 15.4 | 444 / 529 / 715 |
| 50 | 0 / 0.1 / 0.3 | ≥88.3% / ≥88.2% / ≥88.2% | 12.3 / 16.4 / 19.9 | 1488 / 2025 / 1833 |

At 10 robots, HiGHS proves the path-score optimum; CBBA lands around 85% even with message drop. Larger fleets hit the 30s limit, so cells report `≥X%` against the dual/analytical bound (no `timeout` blanks).

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
| `@swarmbid/baseline` | Exact path-score MILP via HiGHS (WASM): set-packing columns or compact slot model |
| `@swarmbid/web` | Vite + React canvas UI with live metrics and MILP % |

## Known limitations

- Path scores used for bidding are frozen at each robot’s initial position; movement does not reprice open auctions mid-run.
- Large fleets (25+) switch from set-packing columns to the compact slot MILP; HiGHS may hit the 30s limit, so those cells report `≥X%` against the MIP/analytical dual bound rather than a proven optimum.
- Permanent network partitions prevent global consensus by design; the property tests assume a connected (non-partitioned) graph.
- Bundle construction is greedy CBBA, not an exhaustive combinatorial auction, so solution quality is not guaranteed optimal even with perfect communication.
