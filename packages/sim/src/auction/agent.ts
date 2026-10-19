/**
 * Per-robot CBBA agent: consensus on inbox → rebuild bundle → broadcast → move.
 */

import type { Message, RobotAction, RobotController, RobotTickInput, Vec2 } from "../types.js";
import { buildBundle, DEFAULT_MAX_BUNDLE_SIZE } from "./bid.js";
import {
  applyConsensusMessage,
  createConsensusState,
  type ConsensusMessage,
  type ConsensusState,
  NO_WINNER,
} from "./consensus.js";

export const CONSENSUS_MSG_TYPE = "cbba_consensus";

export interface CbbaAgentOptions {
  robotId: string;
  peerIds: string[];
  maxBundleSize?: number;
  /** Position used for scoring (frozen so movement does not churn bids). */
  scoreOrigin: Vec2;
}

export interface CbbaAgent {
  readonly robotId: string;
  getState(): ConsensusState;
  /** Task ids currently in the bundle (assignment claims). */
  getBundle(): string[];
  getPath(): string[];
  controller: RobotController;
}

function encodeMessage(state: ConsensusState, time: number): ConsensusMessage {
  return {
    from: state.robotId,
    y: new Map(state.y),
    z: new Map(state.z),
    s: new Map(state.s),
    time,
  };
}

function decodePayload(payload: unknown): ConsensusMessage | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as {
    from?: unknown;
    y?: unknown;
    z?: unknown;
    s?: unknown;
    time?: unknown;
  };
  if (typeof p.from !== "string" || typeof p.time !== "number") {
    return null;
  }
  if (!Array.isArray(p.y) || !Array.isArray(p.z) || !Array.isArray(p.s)) {
    return null;
  }
  return {
    from: p.from,
    time: p.time,
    y: new Map(p.y as [string, number][]),
    z: new Map(p.z as [string, string][]),
    s: new Map(p.s as [string, number][]),
  };
}

function serializeMessage(msg: ConsensusMessage): unknown {
  return {
    from: msg.from,
    time: msg.time,
    y: [...msg.y.entries()],
    z: [...msg.z.entries()],
    s: [...msg.s.entries()],
  };
}

function stepToward(from: Vec2, to: Vec2): Vec2 {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) {
    return { x: dx, y: dx === 0 ? dy : 0 };
  }
  return { x: dy === 0 ? dx : 0, y: dy };
}

/**
 * Create a stateful CBBA agent whose `controller` closes over consensus state.
 */
export function createCbbaAgent(options: CbbaAgentOptions): CbbaAgent {
  const maxBundleSize = options.maxBundleSize ?? DEFAULT_MAX_BUNDLE_SIZE;
  const state = createConsensusState(options.robotId, options.peerIds);
  const scoreRobot = (input: RobotTickInput) => ({
    ...input.robot,
    position: options.scoreOrigin,
  });

  const rebuildBundle = (input: RobotTickInput) => {
    // Drop collected tasks from local claims.
    for (const task of input.world.tasks) {
      if (task.collectedBy !== null) {
        if (state.z.get(task.id) === state.robotId) {
          state.y.set(task.id, 0);
          state.z.set(task.id, NO_WINNER);
        }
      }
    }

    // Keep only tasks we still win (consensus may have truncated via release).
    const keptBundle = state.bundle.filter((id) => {
      const task = input.world.tasks.find((t) => t.id === id);
      return (
        task !== undefined &&
        task.collectedBy === null &&
        state.z.get(id) === state.robotId
      );
    });
    const keptSet = new Set(keptBundle);
    const keptPath = state.path.filter((id) => keptSet.has(id));
    const keptBids = new Map<string, number>();
    for (const id of keptBundle) {
      keptBids.set(id, state.y.get(id) ?? 0);
    }

    const fresh = buildBundle({
      robot: scoreRobot(input),
      tasks: input.world.tasks,
      winningBids: state.y,
      winningAgents: state.z,
      maxBundleSize,
      initialBundle: keptBundle,
      initialPath: keptPath,
      initialBids: keptBids,
    });

    state.bundle = fresh.bundle;
    state.path = fresh.path;
    for (const [taskId, bid] of fresh.bids) {
      state.y.set(taskId, bid);
      state.z.set(taskId, state.robotId);
    }
  };

  const controller: RobotController = (input) => {
    const inbox = [...input.inbox].sort((a, b) => a.id.localeCompare(b.id));
    for (const msg of inbox) {
      if (msg.type !== CONSENSUS_MSG_TYPE) {
        continue;
      }
      const decoded = decodePayload(msg.payload);
      if (decoded) {
        applyConsensusMessage(state, decoded);
      }
    }

    rebuildBundle(input);

    const time = input.world.tick;
    state.s.set(state.robotId, time);
    const outgoing: RobotAction["outgoingMessages"] = [
      {
        from: state.robotId,
        to: "*",
        type: CONSENSUS_MSG_TYPE,
        payload: serializeMessage(encodeMessage(state, time)),
      },
    ];

    const moves: RobotAction["moves"] = [];
    const nextId = state.path[0];
    if (nextId) {
      const task = input.world.tasks.find((t) => t.id === nextId);
      if (task && task.collectedBy === null) {
        const delta = stepToward(input.robot.position, task.position);
        if (delta.x !== 0 || delta.y !== 0) {
          moves.push({ robotId: state.robotId, delta });
        }
      }
    }

    return { moves, outgoingMessages: outgoing };
  };

  return {
    robotId: options.robotId,
    getState: () => state,
    getBundle: () => [...state.bundle],
    getPath: () => [...state.path],
    controller,
  };
}

/**
 * Build CBBA agents for every robot in a roster.
 * `origins` maps robot id → scoring position (usually the initial world pose).
 */
export function createCbbaAgents(
  robotIds: string[],
  options?: { maxBundleSize?: number; origins?: Map<string, Vec2> },
): Map<string, CbbaAgent> {
  const agents = new Map<string, CbbaAgent>();
  for (const robotId of robotIds) {
    const origin = options?.origins?.get(robotId) ?? { x: 0, y: 0 };
    agents.set(
      robotId,
      createCbbaAgent({
        robotId,
        peerIds: robotIds,
        maxBundleSize: options?.maxBundleSize,
        scoreOrigin: origin,
      }),
    );
  }
  return agents;
}

export function controllersFromAgents(
  agents: Map<string, CbbaAgent>,
): Map<string, RobotController> {
  const controllers = new Map<string, RobotController>();
  for (const [id, agent] of agents) {
    controllers.set(id, agent.controller);
  }
  return controllers;
}

/** Global task → robot assignment from agent bundles. */
export function assignmentFromAgents(agents: Map<string, CbbaAgent>): Map<string, string> {
  const assignment = new Map<string, string>();
  for (const agent of agents.values()) {
    const state = agent.getState();
    for (const taskId of state.bundle) {
      if (state.z.get(taskId) === agent.robotId) {
        assignment.set(taskId, agent.robotId);
      }
    }
  }
  return assignment;
}

export function parseConsensusMessage(message: Message): ConsensusMessage | null {
  if (message.type !== CONSENSUS_MSG_TYPE) {
    return null;
  }
  return decodePayload(message.payload);
}
