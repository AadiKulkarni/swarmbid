/**
 * Property tests for CBBA auction convergence under lossy networks.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assignmentFromAgents, isConflictFree, runAuction } from "../src/index.js";

function countTaskClaims(agents: Map<string, { getBundle(): string[] }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents.values()) {
    for (const taskId of agent.getBundle()) {
      counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
    }
  }
  return counts;
}

describe("auction properties", () => {
  it("after convergence, no task is assigned to two robots", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 2, max: 8 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (seed, robotCount, taskCount, dropRate) => {
          const result = runAuction({
            world: {
              width: 16,
              height: 16,
              robotCount,
              taskCount,
              seed,
            },
            network: {
              dropRate,
              minDelay: 0,
              maxDelay: dropRate > 0 ? 2 : 0,
              allowReorder: dropRate > 0,
              partitions: [],
            },
            maxTicks: 150,
            stableTicks: 3,
          });

          const claims = countTaskClaims(result.agents);
          for (const count of claims.values()) {
            expect(count).toBeLessThanOrEqual(1);
          }
          if (result.converged) {
            expect(isConflictFree(result.agents)).toBe(true);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it("every reachable task eventually gets assigned when the network is usable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 2, max: 6 }),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        (seed, robotCount, taskCount, dropRate) => {
          const result = runAuction({
            world: {
              width: 12,
              height: 12,
              robotCount,
              taskCount,
              seed,
            },
            network: {
              dropRate,
              minDelay: 0,
              maxDelay: dropRate > 0 ? 1 : 0,
              allowReorder: dropRate > 0,
              partitions: [],
            },
            maxBundleSize: 3,
            maxTicks: 200,
            stableTicks: 3,
          });

          // Open grid ⇒ every task is reachable. With dropRate < 1 and no
          // partition, CBBA should assign min(tasks, robots * L_t) tasks.
          const capacity = robotCount * 3;
          const expected = Math.min(taskCount, capacity);
          expect(result.converged).toBe(true);
          expect(result.assignment.size).toBe(expected);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("same seed produces an identical event log", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (seed, dropRate) => {
          const opts = {
            world: {
              width: 10,
              height: 10,
              robotCount: 3,
              taskCount: 4,
              seed,
            },
            network: {
              dropRate,
              minDelay: 0,
              maxDelay: 2,
              allowReorder: true,
              partitions: [],
            },
            maxTicks: 40,
            stableTicks: 5,
          } as const;

          const a = runAuction(opts);
          const b = runAuction(opts);
          expect(a.snapshot.events).toEqual(b.snapshot.events);
          expect(assignmentFromAgents(a.agents)).toEqual(assignmentFromAgents(b.agents));
        },
      ),
      { numRuns: 15 },
    );
  });
});
