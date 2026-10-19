# SwarmBid

Deterministic multi-robot auction simulation. Robots bid on tasks over a lossy, delayed, optionally partitioned network; a centralized MILP solver provides the optimal assignment baseline.

## How to run

```bash
pnpm install
pnpm test
pnpm --filter @swarmbid/web dev
```

| Script | Description |
|--------|-------------|
| `pnpm test` | Run Vitest across all packages |
| `pnpm build` | Typecheck / build all packages |
| `pnpm lint` | ESLint |
| `pnpm dev` | Start the web UI (Vite) |

Requires Node 20+ and pnpm 9.6.

## Architecture

| Package | Role |
|---------|------|
| `@swarmbid/sim` | Seeded PRNG, 2D grid world, deterministic message bus, robot `onTick` interface, metrics, auction stubs |
| `@swarmbid/baseline` | Centralized MILP task assignment (`javascript-lp-solver`) for optimal objective comparison |
| `@swarmbid/web` | Vite + React canvas UI: world render, network controls, live metrics and % of MILP optimal |

Simulation runs are fully replayable from a seed: placement, drops, delays, and reorder all flow through mulberry32.
