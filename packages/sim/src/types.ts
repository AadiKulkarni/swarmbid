/**
 * Shared domain types for the SwarmBid simulation.
 *
 * The world is a discrete-time 2D grid of robots and tasks. Robots exchange
 * messages over a lossy, delayed, optionally partitioned network. All
 * randomness is driven by a seeded PRNG so a run is fully replayable.
 */

/** Integer grid coordinate. */
export interface Vec2 {
  x: number;
  y: number;
}

export interface RobotState {
  id: string;
  position: Vec2;
  /** Cells moved per tick (Manhattan steps). */
  speed: number;
  /** Primary claimed task (first in bundle), if any. */
  assignedTaskId: string | null;
  /** Full CBBA bundle claims (task ids). */
  assignedTaskIds: string[];
}

export interface TaskState {
  id: string;
  position: Vec2;
  reward: number;
  /** Robot that has collected this task, if any. */
  collectedBy: string | null;
}

export interface WorldConfig {
  width: number;
  height: number;
  robotCount: number;
  taskCount: number;
  seed: number;
}

export interface WorldState {
  tick: number;
  width: number;
  height: number;
  robots: RobotState[];
  tasks: TaskState[];
  seed: number;
}

/** Payload carried on the robot-to-robot message bus. */
export interface Message {
  id: string;
  from: string;
  to: string | "*";
  type: string;
  payload: unknown;
  /** Tick when the sender enqueued the message. */
  sentAt: number;
}

export interface NetworkConfig {
  /** Probability in [0, 1] that a message is dropped. */
  dropRate: number;
  /** Inclusive minimum delivery delay in ticks. */
  minDelay: number;
  /** Inclusive maximum delivery delay in ticks. */
  maxDelay: number;
  /**
   * When true, delivery order among messages with the same arrival tick
   * is shuffled (still deterministically from the seed).
   */
  allowReorder: boolean;
  /**
   * Partition groups: robots in different groups cannot exchange messages.
   * Empty / omitted means a fully connected network.
   */
  partitions: string[][];
}

export interface MoveCommand {
  robotId: string;
  /** Desired displacement this tick; clamped to robot speed and world bounds. */
  delta: Vec2;
}

export interface RobotAction {
  moves: MoveCommand[];
  outgoingMessages: Omit<Message, "id" | "sentAt">[];
}

/**
 * Per-tick view a robot controller receives. Controllers are pure with
 * respect to this snapshot plus their private inbox.
 */
export interface RobotTickInput {
  robot: RobotState;
  world: Readonly<WorldState>;
  inbox: readonly Message[];
}

export type RobotController = (input: RobotTickInput) => RobotAction;

/** Structured event log entry for determinism / replay. */
export type SimEvent =
  | { kind: "tick"; tick: number }
  | { kind: "move"; tick: number; robotId: string; to: Vec2 }
  | { kind: "message_sent"; tick: number; message: Message }
  | { kind: "message_delivered"; tick: number; message: Message }
  | { kind: "message_dropped"; tick: number; message: Message }
  | { kind: "task_collected"; tick: number; taskId: string; robotId: string }
  | { kind: "assignment"; tick: number; robotId: string; taskId: string };

export interface Metrics {
  totalRewardCollected: number;
  tasksDoubleAssigned: number;
  tasksUnassigned: number;
  messagesSent: number;
  /** Ticks until assignment map stabilizes, or null if not yet converged. */
  timeToConverge: number | null;
}
