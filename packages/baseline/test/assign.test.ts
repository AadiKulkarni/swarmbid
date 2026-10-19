import { createWorld } from "@swarmbid/sim";
import { describe, expect, it } from "vitest";
import { solveAssignment } from "../src/assign.js";

describe("solveAssignment", () => {
  it("returns a feasible assignment with unique robots and tasks", () => {
    const world = createWorld({
      width: 10,
      height: 10,
      robotCount: 3,
      taskCount: 3,
      seed: 42,
    });

    const result = solveAssignment(world, { maxTasksPerRobot: 3 });
    expect(result.feasible).toBe(true);
    expect(result.timedOut).toBe(false);

    const robots = [...result.assignment.values()];
    const tasks = [...result.assignment.keys()];
    expect(new Set(tasks).size).toBe(tasks.length);
    const perRobot = new Map<string, number>();
    for (const robotId of robots) {
      perRobot.set(robotId, (perRobot.get(robotId) ?? 0) + 1);
    }
    for (const count of perRobot.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("is deterministic for the same world", () => {
    const world = createWorld({
      width: 8,
      height: 8,
      robotCount: 4,
      taskCount: 4,
      seed: 7,
    });
    const a = solveAssignment(world);
    const b = solveAssignment(world);
    expect(a.objective).toBe(b.objective);
    expect([...a.assignment.entries()].sort()).toEqual([...b.assignment.entries()].sort());
  });
});
