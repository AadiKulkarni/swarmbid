/**
 * Regression: without cascading release-after-outbid, a robot that loses an
 * early bundle task keeps later tasks whose marginal scores assumed that
 * early task was still on its path — leading to a double assignment when
 * another robot validly claims the later task.
 *
 * Concrete scenario:
 *   r0 at (0,0), r1 at (0,0)  (same start; r1 wins ties via higher bid setup)
 *   t0 at (1,0) reward 30, t1 at (2,0) reward 30
 *
 * r0 builds bundle [t0, t1]. Its bid for t1 is high because the path is
 * (0,0)→(1,0)→(2,0) (cheap incremental travel).
 *
 * r1 then outbids r0 on t0 only. If r0 releases t0 but keeps t1, both r0
 * (still claiming t1) and r1 (who then takes t1 as its second pick, or a
 * third robot) can claim t1 — or more directly: r0's stale z[t1]=r0 blocks
 * correct reassignment while r0 also no longer has a consistent path.
 *
 * With cascading release, outbid on t0 also clears t1 from r0's bundle.
 */

import { describe, expect, it } from "vitest";
import {
  applyConsensusMessage,
  createConsensusState,
  NO_WINNER,
  releaseOutbidTasks,
} from "../src/auction/consensus.js";

describe("release-after-outbid regression", () => {
  it("outbid on an early bundle task releases every later bundle task", () => {
    const state = createConsensusState("r0", ["r0", "r1"]);
    state.bundle = ["t0", "t1"];
    state.path = ["t0", "t1"];
    state.y.set("t0", 28);
    state.y.set("t1", 25);
    state.z.set("t0", "r0");
    state.z.set("t1", "r0");

    // Simulate consensus outcome: r1 won t0 with a higher bid.
    state.z.set("t0", "r1");
    state.y.set("t0", 40);

    const released = releaseOutbidTasks(state);

    expect(released).toEqual(["t0", "t1"]);
    expect(state.bundle).toEqual([]);
    expect(state.path).toEqual([]);
    // Outbid task keeps consensus winner; later task is reset.
    expect(state.z.get("t0")).toBe("r1");
    expect(state.y.get("t0")).toBe(40);
    expect(state.z.get("t1")).toBe(NO_WINNER);
    expect(state.y.get("t1")).toBe(0);
  });

  it("without cascading release, r0 and r1 would both claim t1", () => {
    // Buggy behaviour (illustrated, not executed as the real code path):
    // r0 keeps t1 after losing t0; r1 independently adds t1 → double claim.
    const r0BundleBuggy = ["t1"]; // kept after losing t0
    const r1Bundle = ["t0", "t1"];
    const claims = new Map<string, string[]>();
    for (const id of r0BundleBuggy) {
      const list = claims.get(id) ?? [];
      list.push("r0");
      claims.set(id, list);
    }
    for (const id of r1Bundle) {
      const list = claims.get(id) ?? [];
      list.push("r1");
      claims.set(id, list);
    }
    expect(claims.get("t1")).toEqual(["r0", "r1"]);

    // Correct path via message: r1 announces win on t0; r0 cascades release.
    const state = createConsensusState("r0", ["r0", "r1"]);
    state.bundle = ["t0", "t1"];
    state.path = ["t0", "t1"];
    state.y.set("t0", 28);
    state.y.set("t1", 25);
    state.z.set("t0", "r0");
    state.z.set("t1", "r0");
    state.s.set("r1", 0);

    applyConsensusMessage(state, {
      from: "r1",
      time: 5,
      y: new Map([
        ["t0", 40],
        ["t1", 0],
      ]),
      z: new Map([
        ["t0", "r1"],
        ["t1", NO_WINNER],
      ]),
      s: new Map([
        ["r0", 0],
        ["r1", 5],
      ]),
    });

    expect(state.bundle).not.toContain("t0");
    expect(state.bundle).not.toContain("t1");
    expect(state.z.get("t1")).not.toBe("r0");
  });
});
