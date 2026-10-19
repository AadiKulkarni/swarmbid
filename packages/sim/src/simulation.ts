/**
 * Top-level discrete-time simulation loop.
 *
 * Each tick: deliver inbox → run each robot controller → apply moves →
 * enqueue outgoing messages → collect co-located tasks → update metrics.
 * The event log is the source of truth for determinism tests and replay.
 */

import { emptyMetrics, updateMetrics } from "./metrics.js";
import { MessageBus } from "./network.js";
import type { RobotController } from "./robot.js";
import type {
  Metrics,
  NetworkConfig,
  SimEvent,
  WorldConfig,
  WorldState,
} from "./types.js";
import {
  advanceTick,
  applyMoves,
  collectColocatedTasks,
  createWorld,
} from "./world.js";

export interface SimulationOptions {
  world: WorldConfig;
  network?: Partial<NetworkConfig>;
  /** Controllers keyed by robot id. Missing ids use idle behavior. */
  controllers: Map<string, RobotController>;
}

export interface SimulationSnapshot {
  world: WorldState;
  metrics: Metrics;
  events: SimEvent[];
  /** Message ids dropped this tick (for UI red flash). */
  droppedMessageIds: string[];
}

export class Simulation {
  private world: WorldState;
  private readonly bus: MessageBus;
  private readonly controllers: Map<string, RobotController>;
  private events: SimEvent[] = [];
  private metrics = emptyMetrics();
  private previousAssignment: Map<string, string | null> | null = null;
  private lastDropped: string[] = [];

  constructor(options: SimulationOptions) {
    this.world = createWorld(options.world);
    this.bus = new MessageBus(options.network ?? {}, options.world.seed);
    this.controllers = options.controllers;
  }

  getState(): SimulationSnapshot {
    return {
      world: this.world,
      metrics: this.metrics,
      events: [...this.events],
      droppedMessageIds: [...this.lastDropped],
    };
  }

  /** Advance the world by one discrete tick. */
  step(): SimulationSnapshot {
    const tickEvents: SimEvent[] = [{ kind: "tick", tick: this.world.tick }];
    this.lastDropped = [];

    const { inboxes, events: deliveryEvents } = this.bus.deliver(this.world.tick);
    tickEvents.push(...deliveryEvents);

    const broadcast = inboxes.get("*") ?? [];
    const allMoves = [];
    const outgoing = [];

    for (const robot of this.world.robots) {
      const controller = this.controllers.get(robot.id);
      if (!controller) {
        continue;
      }

      const personal = inboxes.get(robot.id) ?? [];
      const inbox = [
        ...personal,
        ...broadcast.filter(
          (m) => m.from !== robot.id && this.bus.canCommunicate(m.from, robot.id),
        ),
      ];

      const action = controller({
        robot,
        world: this.world,
        inbox,
      });
      allMoves.push(...action.moves);
      outgoing.push(...action.outgoingMessages.map((m) => ({ ...m, from: robot.id })));
    }

    this.world = applyMoves(this.world, allMoves);
    for (const robot of this.world.robots) {
      const moved = allMoves.find((m) => m.robotId === robot.id);
      if (moved) {
        tickEvents.push({
          kind: "move",
          tick: this.world.tick,
          robotId: robot.id,
          to: robot.position,
        });
      }
    }

    for (const partial of outgoing) {
      const { events: sendEvents } = this.bus.send(partial, this.world.tick);
      tickEvents.push(...sendEvents);
      for (const ev of sendEvents) {
        if (ev.kind === "message_dropped") {
          this.lastDropped.push(ev.message.id);
        }
      }
    }

    const collected = collectColocatedTasks(this.world);
    this.world = collected.world;
    for (const c of collected.collected) {
      tickEvents.push({
        kind: "task_collected",
        tick: this.world.tick,
        taskId: c.taskId,
        robotId: c.robotId,
      });
    }

    const updated = updateMetrics({
      world: this.world,
      messagesSent: this.bus.sentCount,
      previousAssignment: this.previousAssignment,
      previousMetrics: this.metrics,
    });
    this.metrics = updated.metrics;
    this.previousAssignment = updated.assignment;

    this.events.push(...tickEvents);
    this.world = advanceTick(this.world);

    return this.getState();
  }

  /** Run `n` ticks and return the final snapshot. */
  run(n: number): SimulationSnapshot {
    let snapshot = this.getState();
    for (let i = 0; i < n; i++) {
      snapshot = this.step();
    }
    return snapshot;
  }
}
