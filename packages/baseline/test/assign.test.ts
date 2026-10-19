import { createWorld } from "@swarmbid/sim";
import { describe, expect, it } from "vitest";
import { solveAssignment } from "../src/assign.js";
import { nodeLocateFile } from "../src/highs-node.js";

describe("solveAssignment", () => {
  it("returns a feasible conflict-free assignment", async () => {
    const world = createWorld({
      width: 10,
      height: 10,
      robotCount: 3,
      taskCount: 3,
      seed: 42,
    });

    const result = await solveAssignment(world, {
      maxTasksPerRobot: 3,
      timeLimitSec: 30,
      locateFile: nodeLocateFile,
    });
    expect(result.feasible).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.provenOptimal).toBe(true);

    const tasks = [...result.assignment.keys()];
    expect(new Set(tasks).size).toBe(tasks.length);

    const perRobot = new Map<string, number>();
    for (const robotId of result.assignment.values()) {
      perRobot.set(robotId, (perRobot.get(robotId) ?? 0) + 1);
    }
    for (const count of perRobot.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("is deterministic for the same world", async () => {
    const world = createWorld({
      width: 8,
      height: 8,
      robotCount: 2,
      taskCount: 3,
      seed: 7,
    });
    const opts = { maxTasksPerRobot: 3, timeLimitSec: 30, locateFile: nodeLocateFile };
    const a = await solveAssignment(world, opts);
    const b = await solveAssignment(world, opts);
    expect(a.objective).toBe(b.objective);
    expect([...a.assignment.entries()].sort()).toEqual([...b.assignment.entries()].sort());
  });
});
