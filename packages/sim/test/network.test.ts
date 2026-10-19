import { describe, expect, it } from "vitest";
import { MessageBus } from "../src/network.js";

describe("MessageBus", () => {
  it("drop rate 1.0 delivers nothing", () => {
    const bus = new MessageBus({ dropRate: 1, minDelay: 0, maxDelay: 0 }, 99);

    for (let i = 0; i < 20; i++) {
      bus.send(
        { from: "r0", to: "r1", type: "bid", payload: { i } },
        0,
      );
    }

    const { inboxes, events } = bus.deliver(0);
    expect(inboxes.size).toBe(0);
    expect(events.filter((e) => e.kind === "message_delivered")).toHaveLength(0);
    expect(events.filter((e) => e.kind === "message_dropped")).toHaveLength(0);
    // Drops are recorded at send time, not deliver time.
  });

  it("records drops at send time when dropRate is 1", () => {
    const bus = new MessageBus({ dropRate: 1, minDelay: 0, maxDelay: 0 }, 1);
    const { events } = bus.send(
      { from: "r0", to: "r1", type: "bid", payload: null },
      0,
    );
    expect(events.some((e) => e.kind === "message_dropped")).toBe(true);
    const delivered = bus.deliver(0);
    expect(delivered.inboxes.size).toBe(0);
  });

  it("partitions block cross-group messages", () => {
    const bus = new MessageBus(
      {
        dropRate: 0,
        minDelay: 0,
        maxDelay: 0,
        partitions: [
          ["r0", "r1"],
          ["r2", "r3"],
        ],
      },
      7,
    );

    const cross = bus.send(
      { from: "r0", to: "r2", type: "bid", payload: null },
      0,
    );
    expect(cross.events.some((e) => e.kind === "message_dropped")).toBe(true);

    const same = bus.send(
      { from: "r0", to: "r1", type: "bid", payload: null },
      0,
    );
    expect(same.events.some((e) => e.kind === "message_dropped")).toBe(false);

    const { inboxes } = bus.deliver(0);
    expect(inboxes.get("r1")?.length).toBe(1);
    expect(inboxes.get("r2")).toBeUndefined();
  });

  it("canCommunicate is false across partitions", () => {
    const bus = new MessageBus(
      {
        partitions: [
          ["r0"],
          ["r1"],
        ],
      },
      3,
    );
    expect(bus.canCommunicate("r0", "r1")).toBe(false);
    expect(bus.canCommunicate("r0", "r0")).toBe(true);
  });
});
