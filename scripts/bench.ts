/**
 * SwarmBid benchmark: CBBA vs exact path-score MILP (HiGHS).
 *
 * Usage: pnpm bench
 *
 * Worlds are keyed by (robots, seed) only — drop rate does not change the
 * instance — so each MILP is solved once and reused across drop-rate cells.
 */

import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  scorePaths,
  solveAssignment,
  type AssignmentResult,
} from "@swarmbid/baseline";
import { nodeLocateFile } from "../packages/baseline/src/highs-node.ts";
import { createWorld, runAuction, type WorldConfig } from "@swarmbid/sim";

const ROBOT_COUNTS = [10, 25, 50] as const;
const DROP_RATES = [0, 0.1, 0.3] as const;
const SEEDS = 20;
const MAX_BUNDLE = 3;
const MILP_TIME_LIMIT_SEC = 30;
const WORLD_SIZE = 40;

interface CellStats {
  robots: number;
  tasks: number;
  dropRate: number;
  /** Mean of (cbba/dualBound)*100 */
  meanPct: number;
  /** True if every seed proved optimal. */
  allProven: boolean;
  meanRounds: number | null;
  meanMessages: number;
  convergedFraction: number;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatNum(value: number | null, digits = 1): string {
  if (value === null) {
    return "—";
  }
  return value.toFixed(digits);
}

function worldConfig(robots: number, seed: number): WorldConfig {
  return {
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    robotCount: robots,
    taskCount: robots * 2,
    seed,
  };
}

async function runCell(
  robots: number,
  dropRate: number,
  milpBySeed: AssignmentResult[],
): Promise<CellStats> {
  const tasks = robots * 2;
  const pcts: number[] = [];
  const rounds: number[] = [];
  const messages: number[] = [];
  let allProven = true;
  let converged = 0;

  for (let s = 0; s < SEEDS; s++) {
    const seed = robots * 10_000 + s;
    const config = worldConfig(robots, seed);

    process.stderr.write(`  seed ${s + 1}/${SEEDS}\r`);

    const auction = runAuction({
      world: config,
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

    const world = createWorld(config);
    const milp = milpBySeed[s]!;
    const cbbaScore = scorePaths(world, auction.paths);
    const bound = milp.dualBound > 0 ? milp.dualBound : milp.objective;
    if (bound > 0) {
      pcts.push((cbbaScore / bound) * 100);
    }
    if (!milp.provenOptimal) {
      allProven = false;
    }
  }

  process.stderr.write("\n");

  return {
    robots,
    tasks,
    dropRate,
    meanPct: mean(pcts),
    allProven,
    meanRounds: rounds.length === 0 ? null : mean(rounds),
    meanMessages: mean(messages),
    convergedFraction: converged / SEEDS,
  };
}

async function solveMilpBank(robots: number): Promise<AssignmentResult[]> {
  const results: AssignmentResult[] = [];
  process.stderr.write(`MILP bank robots=${robots}...\n`);
  for (let s = 0; s < SEEDS; s++) {
    process.stderr.write(`  milp ${s + 1}/${SEEDS}\r`);
    const world = createWorld(worldConfig(robots, robots * 10_000 + s));
    results.push(
      await solveAssignment(world, {
        maxTasksPerRobot: MAX_BUNDLE,
        timeLimitSec: MILP_TIME_LIMIT_SEC,
        locateFile: nodeLocateFile,
      }),
    );
  }
  process.stderr.write("\n");
  return results;
}

function renderMarkdown(cells: CellStats[]): string {
  const lines: string[] = [
    "# SwarmBid benchmark results",
    "",
    `Settings: tasks = 2× robots, bundle size ${MAX_BUNDLE}, ${SEEDS} seeds per cell,`,
    `drop rates {${DROP_RATES.join(", ")}}, HiGHS time limit ${MILP_TIME_LIMIT_SEC}s.`,
    "MILP maximizes the same path-score objective as CBBA (set-packing / arc model).",
    "Auction runs are plan-only (no movement/collection) so paths match the static MILP.",
    "When the solver hits the time limit, “% of optimal” is reported against the MIP",
    "dual bound (tightened by an analytical upper bound) as `≥X%`.",
    "",
    "| Robots | Tasks | Drop rate | Mean % of MILP optimal | Mean rounds to converge | Mean messages sent |",
    "|-------:|------:|----------:|-----------------------:|------------------------:|-------------------:|",
  ];

  for (const cell of cells) {
    const pctLabel = cell.allProven
      ? `${cell.meanPct.toFixed(1)}%`
      : `≥${cell.meanPct.toFixed(1)}%`;
    lines.push(
      `| ${cell.robots} | ${cell.tasks} | ${cell.dropRate} | ${pctLabel} | ${formatNum(cell.meanRounds)} | ${formatNum(cell.meanMessages, 0)} |`,
    );
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- Objective: maximize Σ_robots pathScore(start, ordered path), |path| ≤ 3, tasks disjoint.",
    "- pathScore = Σ_j (reward_j − cumulative Manhattan travel time / speed).",
    "- CBBA % uses each robot's ordered path at convergence vs the MILP dual bound.",
    "- `≥X%` means at least one seed hit the HiGHS time limit; X is mean(cbba/dualBound).",
    "",
  );

  return lines.join("\n");
}

async function main(): Promise<void> {
  const cells: CellStats[] = [];
  for (const robots of ROBOT_COUNTS) {
    const milpBySeed = await solveMilpBank(robots);
    for (const dropRate of DROP_RATES) {
      process.stderr.write(`bench robots=${robots} drop=${dropRate}...\n`);
      cells.push(await runCell(robots, dropRate, milpBySeed));
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
