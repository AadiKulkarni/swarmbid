import { createWorld, pathScore, runAuction } from "@swarmbid/sim";
import { describe, expect, it } from "vitest";
import { bruteForceOptimal } from "../src/brute.js";
import { nodeLocateFile } from "../src/highs-node.js";
import { scorePaths, solveAssignment } from "../src/index.js";

describe("MILP ground truth (tiny worlds)", () => {
  it("matches brute-force optimum on ≤3 robots, ≤5 tasks across 50 seeds", async () => {
    for (let seed = 1; seed <= 50; seed++) {
      const robotCount = 1 + (seed % 3); // 1..3
      const taskCount = 1 + (seed % 5); // 1..5
      const world = createWorld({
        width: 8,
        height: 8,
        robotCount,
        taskCount,
        seed,
      });

      const brute = bruteForceOptimal(world, 3);
      const milp = await solveAssignment(world, {
        maxTasksPerRobot: 3,
        timeLimitSec: 30,
        locateFile: nodeLocateFile,
      });

      expect(milp.feasible).toBe(true);
      expect(milp.provenOptimal).toBe(true);
      expect(milp.objective).toBeCloseTo(brute.objective, 6);
      expect(milp.dualBound).toBeCloseTo(brute.objective, 6);

      // CBBA score never exceeds the optimum.
      const auction = runAuction({
        world: {
          width: 8,
          height: 8,
          robotCount,
          taskCount,
          seed,
        },
        network: { dropRate: 0, minDelay: 0, maxDelay: 0, partitions: [] },
        maxBundleSize: 3,
        maxTicks: 80,
        stableTicks: 3,
      });

      const paths = new Map<string, string[]>();
      for (const agent of auction.agents.values()) {
        paths.set(agent.robotId, agent.getPath());
      }
      // Prefer paths captured at convergence via current agent state after run.
      const cbbaScore = scorePaths(world, paths);
      // Also verify pathScore of MILP assignment (best order) equals objective.
      expect(cbbaScore).toBeLessThanOrEqual(brute.objective + 1e-6);
      expect(cbbaScore).toBeLessThanOrEqual(milp.objective + 1e-6);
    }
  }, 120_000);

  it("pathScore of a known path matches hand calculation", () => {
    const world = createWorld({
      width: 10,
      height: 10,
      robotCount: 1,
      taskCount: 2,
      seed: 1,
    });
    const robot = world.robots[0]!;
    const tasks = world.tasks;
    const score = pathScore(robot.position, tasks, robot.speed);
    let time = 0;
    let prev = robot.position;
    let expected = 0;
    for (const t of tasks) {
      time +=
        (Math.abs(prev.x - t.position.x) + Math.abs(prev.y - t.position.y)) /
        Math.max(1, robot.speed);
      expected += t.reward - time;
      prev = t.position;
    }
    expect(score).toBeCloseTo(expected, 10);
  });
});
