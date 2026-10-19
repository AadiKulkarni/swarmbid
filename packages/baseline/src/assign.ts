/**
 * Exact centralized optimum for the CBBA path-score objective.
 *
 * Preferred model: set-packing MILP with columns = (robot, ordered path),
 * score = pathScore (identical to CBBA). When columns are too numerous, an
 * equivalent compact slot/arc MILP is used.
 *
 * Solved with HiGHS (WASM). On time limit we keep the incumbent and a dual
 * bound tightened by the analytical pathScoreUpperBound.
 */

import type { WorldState } from "@swarmbid/sim";
import { assignmentFromArcColumns, buildArcLp } from "./arc.js";
import {
  columnsToLp,
  enumerateColumns,
  estimateSubsetColumns,
  SUBSET_COLUMN_HARD_LIMIT,
  type Column,
} from "./columns.js";
import { greedyPaths } from "./greedy.js";
import { loadHighs } from "./highs.js";
import { pathScoreUpperBound } from "./score.js";

export interface SolveOptions {
  /** Max path length L_t (CBBA bundle capacity). Default 3. */
  maxTasksPerRobot?: number;
  /** HiGHS wall-clock limit in seconds. Default 30. */
  timeLimitSec?: number;
  /** Override wasm locator (Node / Vite worker). */
  locateFile?: (file: string) => string;
}

export interface AssignmentResult {
  /** taskId → robotId */
  assignment: Map<string, string>;
  /** Best feasible objective (path-score sum). */
  objective: number;
  /** Upper bound on the optimum (MIP dual ∩ analytical UB). */
  dualBound: number;
  feasible: boolean;
  /** True when HiGHS stopped on the time limit. */
  timedOut: boolean;
  /** True when status is Optimal. */
  provenOptimal: boolean;
  model: "columns" | "arc";
}

export { bestPathScore, scoreAssignment, scorePaths, pathScoreUpperBound } from "./score.js";

/** HiGHS model status codes used here. */
const STATUS_OPTIMAL = 7;
const STATUS_TIME_LIMIT = 13;

function assignmentFromColumns(
  columns: Column[],
  nameToValue: Map<string, number>,
): Map<string, string> {
  const assignment = new Map<string, string>();
  for (const col of columns) {
    if ((nameToValue.get(col.id) ?? 0) < 0.5) {
      continue;
    }
    for (const taskId of col.taskIds) {
      assignment.set(taskId, col.robotId);
    }
  }
  return assignment;
}

function readColumnValues(model: {
  getDimensions: () => { numCols: number };
  getColName: (i: number) => string;
  getSolution: () => { colValue: Float64Array };
}): Map<string, number> {
  const { numCols } = model.getDimensions();
  const { colValue } = model.getSolution();
  const map = new Map<string, number>();
  for (let i = 0; i < numCols; i++) {
    map.set(model.getColName(i), colValue[i] ?? 0);
  }
  return map;
}

function warmStartFromGreedy(
  model: {
    getDimensions: () => { numCols: number };
    getColName: (i: number) => string;
    setSolution: (s: { colValue: Float64Array }) => unknown;
  },
  kind: "columns" | "arc",
  columns: Column[] | null,
  greedy: ReturnType<typeof greedyPaths>,
): void {
  const { numCols } = model.getDimensions();
  const colValue = new Float64Array(numCols);
  const want = new Set<string>();

  if (kind === "arc") {
    for (const [robotId, taskIds] of greedy.paths) {
      taskIds.forEach((taskId, i) => {
        want.add(`x_${robotId}_${taskId}_${i + 1}`);
      });
    }
  } else if (columns) {
    for (const col of columns) {
      const path = greedy.paths.get(col.robotId);
      if (!path || path.length !== col.taskIds.length) {
        continue;
      }
      if (path.every((id, i) => id === col.taskIds[i])) {
        want.add(col.id);
      }
    }
  }

  for (let i = 0; i < numCols; i++) {
    if (want.has(model.getColName(i))) {
      colValue[i] = 1;
    }
  }
  model.setSolution({ colValue });
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Solve the exact path-score assignment MILP with HiGHS.
 */
export async function solveAssignment(
  world: WorldState,
  options: SolveOptions = {},
): Promise<AssignmentResult> {
  const maxTasksPerRobot = options.maxTasksPerRobot ?? 3;
  const timeLimitSec = options.timeLimitSec ?? 30;

  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);

  if (robots.length === 0 || tasks.length === 0) {
    return {
      assignment: new Map(),
      objective: 0,
      dualBound: 0,
      feasible: true,
      timedOut: false,
      provenOptimal: true,
      model: "columns",
    };
  }

  const greedy = greedyPaths(world, maxTasksPerRobot);
  const analyticalUb = pathScoreUpperBound(world);
  const highs = await loadHighs(options.locateFile);
  let columns: Column[] | null = null;
  let modelKind: "columns" | "arc" = "columns";
  let lp: string;

  if (
    estimateSubsetColumns(robots.length, tasks.length, maxTasksPerRobot) <=
    SUBSET_COLUMN_HARD_LIMIT
  ) {
    const enumerated = enumerateColumns(world, maxTasksPerRobot);
    if (enumerated) {
      columns = enumerated.columns;
      lp = columnsToLp(
        columns,
        tasks.map((t) => t.id),
        robots.map((r) => r.id),
      );
    } else {
      modelKind = "arc";
      lp = buildArcLp(world, maxTasksPerRobot);
    }
  } else {
    modelKind = "arc";
    lp = buildArcLp(world, maxTasksPerRobot);
  }

  const model = highs.createModel({ format: "lp", data: lp });
  try {
    warmStartFromGreedy(model, modelKind, columns, greedy);
    model.options.set("time_limit", timeLimitSec);
    model.options.set("output_flag", false);
    model.run();

    const status = model.getModelStatus();
    const rawObj = Number(model.getObjectiveValue());
    const rawDual = Number(model.info.get("mip_dual_bound"));
    const timedOut = status === STATUS_TIME_LIMIT;
    const provenOptimal = status === STATUS_OPTIMAL;

    // Prefer solver incumbent; fall back to greedy if HiGHS reports non-finite.
    let objective = finiteOr(rawObj, greedy.score);
    if (!Number.isFinite(rawObj) || (timedOut && objective < greedy.score - 1e-9)) {
      objective = Math.max(finiteOr(rawObj, 0), greedy.score);
    }

    // Dual bound: MIP dual ∩ analytical UB, never below incumbent.
    let dualBound: number;
    if (provenOptimal) {
      dualBound = objective;
    } else {
      dualBound = finiteOr(rawDual, analyticalUb);
      dualBound = Math.min(dualBound, analyticalUb);
      dualBound = Math.max(dualBound, objective);
    }

    const feasible = Number.isFinite(objective);

    let assignment: Map<string, string>;
    if (feasible && Number.isFinite(rawObj) && rawObj + 1e-6 >= greedy.score) {
      const values = readColumnValues(model);
      assignment =
        modelKind === "columns" && columns
          ? assignmentFromColumns(columns, values)
          : assignmentFromArcColumns(
              Object.fromEntries([...values].map(([k, v]) => [k, { Primal: v }])),
            );
      // If extraction looks empty but objective is positive, trust greedy.
      if (assignment.size === 0 && objective > 1e-9) {
        assignment = greedy.assignment;
      }
    } else {
      assignment = greedy.assignment;
      objective = Math.max(objective, greedy.score);
      dualBound = Math.max(dualBound, objective);
    }

    return {
      assignment,
      objective,
      dualBound,
      feasible,
      timedOut,
      provenOptimal,
      model: modelKind,
    };
  } finally {
    model.dispose();
  }
}

/** Format a CBBA/MILP ratio for tables. */
export function formatPctOfBound(
  score: number,
  dualBound: number,
  provenOptimal: boolean,
): string {
  if (dualBound <= 0) {
    return "—";
  }
  const pct = (score / dualBound) * 100;
  return provenOptimal ? `${pct.toFixed(1)}%` : `≥${pct.toFixed(1)}%`;
}
