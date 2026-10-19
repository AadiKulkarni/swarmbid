import { describe, expect, it } from "vitest";
import { Simulation } from "../src/index.js";

function runOnce(seed: number) {
  const robotIds = ["r0", "r1", "r2"];
  // Controllers ping peers so drops/delays/reorder are exercised in the log.
  const controllers = new Map(
    robotIds.map((id) => [
      id,
      () => ({
        moves: [],
        outgoingMessages: [
          {
            from: id,
            to: "*" as const,
            type: "ping",
            payload: { id },
          },
        ],
      }),
    ]),
  );

  const sim = new Simulation({
    world: {
      width: 12,
      height: 12,
      robotCount: 3,
      taskCount: 4,
      seed,
    },
    network: {
      dropRate: 0.25,
      minDelay: 0,
      maxDelay: 3,
      allowReorder: true,
      partitions: [],
    },
    controllers,
  });

  return sim.run(30).events;
}

describe("determinism", () => {
  it("same seed produces identical event logs", () => {
    const a = runOnce(12345);
    const b = runOnce(12345);
    expect(a).toEqual(b);
  });

  it("different seeds diverge", () => {
    const a = runOnce(1);
    const b = runOnce(2);
    expect(a).not.toEqual(b);
  });
});
