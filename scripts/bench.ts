/**
 * SwarmBid benchmark: CBBA vs MILP across robot counts and drop rates.
 *
 * Usage: pnpm bench
 */

import { mkdir, writeFile } from node:fs/promises;
import { dirname, join } from node:path;
import { fileURLToPath } from node:url;
import { scoreAssignment, solveAssignment } from "@swarmbid/baseline";
import { createWorld, runAuction } from "@swarmbid/sim";

const ROBOT_COUNTS = [10, 25, 50] as const;
const DROP_RATES = [0, 0.1, 0.3] as const;
const SEEDS = 20;
const MAX_BUNDLE = 3;
const MILP_TIMEOUT_MS = 3_000;
const WORLD_SIZE = 40;

interface CellStats {
  robots: number;
  tasks: number;
  dropRate: number;
  meanPctOptimal: number | null;
  meanRounds: number | null;
  meanMessages: number;
  milpTimedOut: boolean;
  convergedFraction: number;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatPct(value: number | null): string {
  if (value === null) {
    return "timeout";
  }
  return `${value.toFixed(1)}%`;
}

function formatNum(value: number | null, digits = 1): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(digits);
}

async function runCell(robots: number, dropRate: number): Promise<CellStats> {
  const tasks = robots * 2;
  const pcts: number[] = [];
  const rounds: number[] = [];
  const messages: number[] = [];
  let milpTimedOut = false;
  let converged = 0;

  for (let s = 0; s < SEEDS; s++) {
    const seed = robots * 10_000 + Math.round(dropRate * 1000) * 100 + s;
    const worldConfig = {
      width: WORLD_SIZE,
      height: WORLD_SIZE,
      robotCount: robots,
      taskCount: tasks,
      seed,
    };

    const auction = runAuction({
      world: worldConfig,
      network: {
        dropRate,
        minDelay: 0,
        maxDelay: dropRate > 0 ? 2 : 0,
        allowReorder: dropRate > 0,
        partitions: [],
      },
      maxBundleSize: MAX_BUNDLE,
      maxTicks: robots <= 10 ? 80 : robots <= 25 ? 120 : 160,
      stableTicks: 3,
    });

    messages.push(auction.snapshot.metrics.messagesSent);
    if (auction.converged && auction.roundsToConverge !== null) {
      converged += 1;
      rounds.push(auction.roundsToConverge);
    }

    const world = createWorld(worldConfig);
    const milp = solveAssignment(world, {
      maxTasksPerRobot: MAX_BUNDLE,
      timeoutMs: MILP_TIMEOUT_MS,
      maxVariables: 1_200,
    });

    if (milp.timedOut) {
      milpTimedOut = true;
    } else if (milp.feasible && milp.objective > 0) {
      const auctionScore = scoreAssignment(world, auction.assignment);
      pcts.push((auctionScore / milp.objective) * 100);
    }
  }

  return {
    robots,
    tasks,
    dropRate,
    meanPctOptimal: milpTimedOut || pcts.length === 0 ? null : mean(pcts),
    meanRounds: rounds.length === 0 ? null : mean(rounds),
    meanMessages: mean(messages),
    milpTimedOut,
    convergedFraction: converged / SEEDS,
  };
}

function renderMarkdown(cells: CellStats[]): string {
  const lines: string[] = [
    "# SwarmBid benchmark results",
    "",
    `Settings: tasks = 2× robots, bundle size ${MAX_BUNDLE}, ${SEEDS} seeds per cell,`,
    `drop rates {${DROP_RATES.join(", ")}}, MILP timeout ${MILP_TIMEOUT_MS}ms`,
    `(models with robots×tasks > 1200 are marked timeout without solving).`,
    "",
    "| Robots | Tasks | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages sent |",
    "|-------:|------:|----------:|-----------------------:|------------------------:|-------------------:|",
  ];

  for (const cell of cells) {
    const pct = cell.milpTimedOut ? "timeout" : formatPct(cell.meanPctOptimal);
    lines.push(
      `| ${cell.robots} | ${cell.tasks} | ${cell.dropRate} | ${pct} | ${formatNum(cell.meanRounds)} | ${formatNum(cell.meanMessages, 0)} |`,
    );
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- % of MILP optimal compares the CBBA assignment score (sum of reward − Manhattan)",
    "  to the centralized MILP objective with the same per-robot capacity.",
    "- Rounds to converge = ticks until the assignment stayed stable for 3 ticks.",
    "- Cells marked `timeout` skipped or overran the MILP budget; auction metrics still run.",
    "",
  );

  return lines.join("\n");
}

async function main(): Promise<void> {
  const cells: CellStats[] = [];
  for (const robots of ROBOT_COUNTS) {
    for (const dropRate of DROP_RATES) {
      process.stderr.write(`bench robots=${robots} drop=${dropRate}...\n`);
      cells.push(await runCell(robots, dropRate));
    }
  }

  const md = renderMarkdown(cells);
  const here = dirname(fileURLToPath(import.meta.url));
  const out = join(here, "..", "docs", "benchmark-results.md");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, md, "utf8");
  process.stdout.write(md);
  process.stderr.write(`\nWrote ${out}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
