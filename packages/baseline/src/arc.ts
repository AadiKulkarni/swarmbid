/**
 * Compact sequencing MILP with the same pathScore objective as CBBA.
 *
 * Variables:
 *   x[r,j,p] ∈ {0,1}  — robot r visits task j in path slot p (1..L)
 *   a[r,p] ≥ 0         — arrival time at slot p
 *   dx±, dy± ≥ 0       — Manhattan pieces between consecutive slots
 *
 * Travel between slots is encoded with continuous absolute-value variables
 * (not pairwise binaries), so size is O(R·T·L) binaries and O(R·T·L)
 * constraints — small enough for HiGHS WASM on 50×100 worlds.
 *
 * Objective = Σ reward·x − Σ a  ≡  Σ_robots pathScore(start, ordered path).
 */

import { manhattan, type WorldState } from "@swarmbid/sim";

function dist(ax: number, ay: number, bx: number, by: number, speed: number): number {
  return manhattan({ x: ax, y: ay }, { x: bx, y: by }) / Math.max(1, speed);
}

export function buildArcLp(world: WorldState, maxBundleSize: number): string {
  const robots = world.robots;
  const tasks = world.tasks.filter((t) => t.collectedBy === null);
  const L = maxBundleSize;

  let maxCoord = 0;
  let maxHop = 0;
  for (const r of robots) {
    for (const t of tasks) {
      maxCoord = Math.max(maxCoord, Math.abs(t.position.x), Math.abs(t.position.y));
      maxHop = Math.max(
        maxHop,
        dist(r.position.x, r.position.y, t.position.x, t.position.y, r.speed),
      );
    }
  }
  for (const a of tasks) {
    for (const b of tasks) {
      if (a.id === b.id) {
        continue;
      }
      maxHop = Math.max(
        maxHop,
        dist(a.position.x, a.position.y, b.position.x, b.position.y, 1),
      );
    }
  }
  // Big-M: cover max arrival and max |coord| gaps when a slot is empty.
  const M = maxHop * L + 2 * maxCoord + 1;

  const x = (r: string, j: string, p: number) => `x_${r}_${j}_${p}`;
  const a = (r: string, p: number) => `a_${r}_${p}`;
  const dxp = (r: string, p: number) => `dxp_${r}_${p}`;
  const dxn = (r: string, p: number) => `dxn_${r}_${p}`;
  const dyp = (r: string, p: number) => `dyp_${r}_${p}`;
  const dyn = (r: string, p: number) => `dyn_${r}_${p}`;
  const occTerms = (r: string, p: number) => tasks.map((t) => x(r, t.id, p));
  const occSum = (r: string, p: number) => occTerms(r, p).join(" + ");
  /** Subtract `coeff * (x1 + x2 + …)` → `- coeff x1 - coeff x2 - …` */
  const minusScaledOcc = (coeff: number, r: string, p: number) =>
    occTerms(r, p).map((v) => `- ${coeff} ${v}`).join(" ");
  /** Subtract occupancy sum → `- x1 - x2 - …` */
  const minusOcc = (r: string, p: number) =>
    occTerms(r, p).map((v) => `- ${v}`).join(" ");

  const lines: string[] = [];
  const obj: string[] = [];
  for (const r of robots) {
    for (const t of tasks) {
      for (let p = 1; p <= L; p++) {
        obj.push(`${t.reward} ${x(r.id, t.id, p)}`);
      }
    }
    for (let p = 1; p <= L; p++) {
      obj.push(`- ${a(r.id, p)}`);
    }
  }
  lines.push("Maximize");
  lines.push(obj.length ? ` obj: ${obj.join(" + ").replace(/\+ - /g, "- ")}` : " obj: 0");
  lines.push("Subject To");

  // Each task assigned to at most one (robot, slot).
  for (const t of tasks) {
    const terms: string[] = [];
    for (const r of robots) {
      for (let p = 1; p <= L; p++) {
        terms.push(x(r.id, t.id, p));
      }
    }
    lines.push(` task_${t.id}: ${terms.join(" + ")} <= 1`);
  }

  for (const r of robots) {
    const speed = Math.max(1, r.speed);

    // At most one task per slot; paths are prefix-contiguous.
    for (let p = 1; p <= L; p++) {
      lines.push(` slot_${r.id}_${p}: ${occSum(r.id, p)} <= 1`);
    }
    for (let p = 1; p < L; p++) {
      lines.push(
        ` contig_${r.id}_${p}: ${occSum(r.id, p + 1)} ${minusOcc(r.id, p)} <= 0`,
      );
    }

    // a_p = 0 when slot empty; a_1 >= d(start,j) when j in slot 1.
    lines.push(` az_${r.id}_1: ${a(r.id, 1)} ${minusScaledOcc(M, r.id, 1)} <= 0`);
    for (const t of tasks) {
      const d = dist(r.position.x, r.position.y, t.position.x, t.position.y, r.speed);
      lines.push(` as_${r.id}_${t.id}: ${d} ${x(r.id, t.id, 1)} - ${a(r.id, 1)} <= 0`);
    }

    for (let p = 1; p < L; p++) {
      lines.push(
        ` az_${r.id}_${p + 1}: ${a(r.id, p + 1)} ${minusScaledOcc(M, r.id, p + 1)} <= 0`,
      );

      // px[p] - px[p+1] = dx+ - dx-  (and same for y)
      const pxParts: string[] = [];
      const pyParts: string[] = [];
      for (const t of tasks) {
        pxParts.push(`${t.position.x} ${x(r.id, t.id, p)}`);
        pyParts.push(`${t.position.y} ${x(r.id, t.id, p)}`);
      }
      for (const t of tasks) {
        pxParts.push(`- ${t.position.x} ${x(r.id, t.id, p + 1)}`);
        pyParts.push(`- ${t.position.y} ${x(r.id, t.id, p + 1)}`);
      }
      lines.push(
        ` dx_${r.id}_${p}: ${pxParts.join(" + ").replace(/\+ - /g, "- ")} - ${dxp(r.id, p)} + ${dxn(r.id, p)} = 0`,
      );
      lines.push(
        ` dy_${r.id}_${p}: ${pyParts.join(" + ").replace(/\+ - /g, "- ")} - ${dyp(r.id, p)} + ${dyn(r.id, p)} = 0`,
      );

      // a[p+1] >= a[p] + manhattan/speed - M(1 - occ[p+1])
      // ⇒ a[p] - a[p+1] + hop/speed + M·occ[p+1] <= M
      const inv = 1 / speed;
      const plusScaledOcc = occTerms(r.id, p + 1)
        .map((v) => `+ ${M} ${v}`)
        .join(" ");
      lines.push(
        ` at_${r.id}_${p}: ${a(r.id, p)} - ${a(r.id, p + 1)} + ${inv} ${dxp(r.id, p)} + ${inv} ${dxn(
          r.id,
          p,
        )} + ${inv} ${dyp(r.id, p)} + ${inv} ${dyn(r.id, p)} ${plusScaledOcc} <= ${M}`,
      );
    }
  }

  lines.push("Bounds");
  for (const r of robots) {
    for (let p = 1; p <= L; p++) {
      lines.push(` 0 <= ${a(r.id, p)}`);
    }
    for (let p = 1; p < L; p++) {
      lines.push(` 0 <= ${dxp(r.id, p)}`);
      lines.push(` 0 <= ${dxn(r.id, p)}`);
      lines.push(` 0 <= ${dyp(r.id, p)}`);
      lines.push(` 0 <= ${dyn(r.id, p)}`);
    }
  }

  lines.push("Binary");
  for (const r of robots) {
    for (const t of tasks) {
      for (let p = 1; p <= L; p++) {
        lines.push(` ${x(r.id, t.id, p)}`);
      }
    }
  }
  lines.push("End");
  return lines.join("\n");
}

/** Extract task→robot assignment from arc-model column values. */
export function assignmentFromArcColumns(
  columns: Record<string, { Primal?: number }>,
): Map<string, string> {
  const assignment = new Map<string, string>();
  for (const [name, col] of Object.entries(columns)) {
    if (!name.startsWith("x_")) {
      continue;
    }
    if ((col.Primal ?? 0) < 0.5) {
      continue;
    }
    // x_rID_tID_p  — robot/task ids are rN / tN (no underscores inside)
    const match = /^x_(r\d+)_(t\d+)_\d+$/.exec(name);
    if (!match) {
      continue;
    }
    assignment.set(match[2]!, match[1]!);
  }
  return assignment;
}
