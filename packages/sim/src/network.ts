/**
 * Deterministic message bus between robots.
 *
 * Given the same seed and sequence of send calls, delivery (drops, delays,
 * reorder within an arrival tick, and partition filtering) is identical
 * across runs. Partition groups that cannot talk are checked at send time.
 */

import { createMulberry32, nextBool, nextInt, shuffleInPlace, type Rng } from "./prng.js";
import type { Message, NetworkConfig, SimEvent } from "./types.js";

interface InFlight {
  message: Message;
  deliverAt: number;
}

export const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  dropRate: 0,
  minDelay: 0,
  maxDelay: 0,
  allowReorder: false,
  partitions: [],
};

export class MessageBus {
  private readonly config: NetworkConfig;
  private readonly rng: Rng;
  private readonly partitionOf = new Map<string, number>();
  private inFlight: InFlight[] = [];
  private nextMessageId = 0;
  private messagesSent = 0;

  constructor(config: Partial<NetworkConfig>, seed: number) {
    this.config = { ...DEFAULT_NETWORK_CONFIG, ...config };
    if (this.config.minDelay > this.config.maxDelay) {
      throw new Error("NetworkConfig: minDelay must be <= maxDelay");
    }
    this.rng = createMulberry32(seed ^ 0x9e3779b9);

    this.config.partitions.forEach((group, index) => {
      for (const robotId of group) {
        this.partitionOf.set(robotId, index);
      }
    });
  }

  get sentCount(): number {
    return this.messagesSent;
  }

  /**
   * Enqueue an outgoing message. Returns events for sent / dropped.
   * Dropped and cross-partition messages never enter the in-flight queue.
   */
  send(
    partial: Omit<Message, "id" | "sentAt">,
    tick: number,
  ): { message: Message; events: SimEvent[] } {
    const message: Message = {
      ...partial,
      id: `m${this.nextMessageId++}`,
      sentAt: tick,
    };
    this.messagesSent += 1;
    const events: SimEvent[] = [{ kind: "message_sent", tick, message }];

    if (!this.canCommunicate(message.from, message.to)) {
      events.push({ kind: "message_dropped", tick, message });
      return { message, events };
    }

    if (nextBool(this.rng, this.config.dropRate)) {
      events.push({ kind: "message_dropped", tick, message });
      return { message, events };
    }

    const delay = nextInt(this.rng, this.config.minDelay, this.config.maxDelay);
    this.inFlight.push({ message, deliverAt: tick + delay });
    return { message, events };
  }

  /**
   * Deliver all messages whose deliverAt <= current tick into per-robot
   * inboxes. When allowReorder is set, messages sharing an arrival tick
   * are shuffled before distribution.
   */
  deliver(tick: number): { inboxes: Map<string, Message[]>; events: SimEvent[] } {
    const due = this.inFlight.filter((item) => item.deliverAt <= tick);
    this.inFlight = this.inFlight.filter((item) => item.deliverAt > tick);

    if (this.config.allowReorder && due.length > 1) {
      shuffleInPlace(due, this.rng);
    } else {
      due.sort((a, b) => a.deliverAt - b.deliverAt || a.message.id.localeCompare(b.message.id));
    }

    const inboxes = new Map<string, Message[]>();
    const events: SimEvent[] = [];

    for (const item of due) {
      const { message } = item;
      events.push({ kind: "message_delivered", tick, message });

      if (message.to === "*") {
        // Broadcast is handled by the simulation loop (fan-out to peers).
        const list = inboxes.get("*") ?? [];
        list.push(message);
        inboxes.set("*", list);
      } else {
        const list = inboxes.get(message.to) ?? [];
        list.push(message);
        inboxes.set(message.to, list);
      }
    }

    return { inboxes, events };
  }

  /** True when from and to are allowed to talk under the current partitions. */
  canCommunicate(from: string, to: string): boolean {
    if (this.config.partitions.length === 0) {
      return true;
    }
    if (to === "*") {
      // Broadcasts are allowed; recipients filter via canCommunicate at fan-out.
      return true;
    }
    const a = this.partitionOf.get(from);
    const b = this.partitionOf.get(to);
    if (a === undefined || b === undefined) {
      // Robots not listed in any partition are treated as fully connected.
      return true;
    }
    return a === b;
  }
}
