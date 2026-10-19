/**
 * CBBA Phase 2 — consensus with timestamps (Choi, Brunet, How 2009).
 *
 * Each robot stores winning bids y[task], winners z[task], and timestamps
 * s[robot] of the last info received about each peer. On a neighbor message,
 * Table I update/reset/leave rules decide whose bid wins; stale info (older
 * timestamps) never overwrites newer info. When the receiver is outbid on a
 * bundle task, that task and every task added after it are released.
 */

/** Empty winner sentinel (paper's ∅). */
export const NO_WINNER = "";

export interface WinningBid {
  robotId: string;
  taskId: string;
  bid: number;
}

/** Local CBBA consensus vectors for one robot. */
export interface ConsensusState {
  robotId: string;
  /** y_j: winning bid for each task. */
  y: Map<string, number>;
  /** z_j: winning robot for each task ("" = none). */
  z: Map<string, string>;
  /** s_k: timestamp of last info about robot k. */
  s: Map<string, number>;
  /** Bundle: task ids in the order they were added. */
  bundle: string[];
  /** Path: task ids in visit order. */
  path: string[];
}

/** Payload broadcast to neighbors each consensus round. */
export interface ConsensusMessage {
  from: string;
  y: Map<string, number>;
  z: Map<string, string>;
  s: Map<string, number>;
  /** Sender's clock / tick at send time (τ_r for the receiver). */
  time: number;
}

export type ConsensusAction = "update" | "reset" | "leave";

export interface ConsensusInput {
  /** Local winning-bid tables keyed by robot id. */
  localTables: Map<string, WinningBid[]>;
}

export interface ConsensusResult {
  /** Conflict-free task → winning robot assignment. */
  assignment: Map<string, string>;
  /** Updated per-robot tables after this consensus round. */
  updatedTables: Map<string, WinningBid[]>;
}

export function createConsensusState(robotId: string, peerIds: readonly string[]): ConsensusState {
  const s = new Map<string, number>();
  for (const id of peerIds) {
    s.set(id, 0);
  }
  s.set(robotId, 0);
  return {
    robotId,
    y: new Map(),
    z: new Map(),
    s,
    bundle: [],
    path: [],
  };
}

function bidOf(y: Map<string, number>, taskId: string): number {
  return y.get(taskId) ?? 0;
}

function winnerOf(z: Map<string, string>, taskId: string): string {
  return z.get(taskId) ?? NO_WINNER;
}

function stampOf(s: Map<string, number>, robotId: string): number {
  return s.get(robotId) ?? 0;
}

/**
 * True when (bidA, winnerA) should replace (bidB, winnerB).
 * Higher bid wins; equal bids break ties by lexicographically smaller robot id.
 */
export function bidBeats(
  bidA: number,
  winnerA: string,
  bidB: number,
  winnerB: string,
): boolean {
  if (bidA !== bidB) {
    return bidA > bidB;
  }
  if (winnerA === NO_WINNER) {
    return false;
  }
  if (winnerB === NO_WINNER) {
    return true;
  }
  return winnerA.localeCompare(winnerB) < 0;
}

/**
 * Table I action for one task when receiver `i` hears sender `k`.
 * Default is leave.
 */
export function consensusActionForTask(
  i: string,
  k: string,
  taskId: string,
  receiver: Pick<ConsensusState, "y" | "z" | "s">,
  sender: Pick<ConsensusMessage, "y" | "z" | "s">,
): ConsensusAction {
  const zkj = winnerOf(sender.z, taskId);
  const zij = winnerOf(receiver.z, taskId);
  const ykj = bidOf(sender.y, taskId);
  const yij = bidOf(receiver.y, taskId);
  const sk = (agent: string) => stampOf(sender.s, agent);
  const si = (agent: string) => stampOf(receiver.s, agent);

  // Sender thinks winner is k
  if (zkj === k) {
    if (zij === i) {
      return bidBeats(ykj, zkj, yij, zij) ? "update" : "leave";
    }
    if (zij === k) {
      return "update";
    }
    if (zij !== NO_WINNER) {
      // m ∉ {i, k}
      return sk(zij) > si(zij) || bidBeats(ykj, zkj, yij, zij) ? "update" : "leave";
    }
    return "update"; // none
  }

  // Sender thinks winner is i (receiver)
  if (zkj === i) {
    if (zij === i) {
      return "leave";
    }
    if (zij === k) {
      return "reset";
    }
    if (zij !== NO_WINNER) {
      return sk(zij) > si(zij) ? "reset" : "leave";
    }
    return "leave"; // none
  }

  // Sender thinks winner is some other m ∉ {i, k}
  if (zkj !== NO_WINNER) {
    const m = zkj;
    if (zij === i) {
      return sk(m) > si(m) && bidBeats(ykj, zkj, yij, zij) ? "update" : "leave";
    }
    if (zij === k) {
      return sk(m) > si(m) ? "update" : "reset";
    }
    if (zij === m) {
      return sk(m) > si(m) ? "update" : "leave";
    }
    if (zij !== NO_WINNER) {
      const n = zij;
      if (sk(m) > si(m) && sk(n) > si(n)) {
        return "update";
      }
      if (sk(m) > si(m) && bidBeats(ykj, zkj, yij, zij)) {
        return "update";
      }
      if (sk(n) > si(n) && si(m) > sk(m)) {
        return "reset";
      }
      return "leave";
    }
    return sk(m) > si(m) ? "update" : "leave";
  }

  // Sender thinks winner is none
  if (zij === i) {
    return "leave";
  }
  if (zij === k) {
    return "update";
  }
  if (zij !== NO_WINNER) {
    return sk(zij) > si(zij) ? "update" : "leave";
  }
  return "leave";
}

function applyAction(
  state: ConsensusState,
  taskId: string,
  action: ConsensusAction,
  sender: ConsensusMessage,
): boolean {
  if (action === "leave") {
    return false;
  }
  if (action === "update") {
    state.y.set(taskId, bidOf(sender.y, taskId));
    state.z.set(taskId, winnerOf(sender.z, taskId));
    return true;
  }
  // reset
  state.y.set(taskId, 0);
  state.z.set(taskId, NO_WINNER);
  return true;
}

/**
 * Release the first outbid bundle task and every task added after it.
 *
 * Per CBBA: the outbid task keeps its consensus-updated y/z (so we remember
 * who beat us), while every *later* bundle task has y/z reset because those
 * marginal scores are no longer valid. Returns the released task ids.
 */
export function releaseOutbidTasks(state: ConsensusState): string[] {
  const cut = state.bundle.findIndex((taskId) => winnerOf(state.z, taskId) !== state.robotId);
  if (cut < 0) {
    return [];
  }

  const released = state.bundle.slice(cut);
  // Reset y/z only for later tasks we still think we own. If consensus already
  // wrote another winner for a later bundle task in this round, keep it.
  for (const taskId of released.slice(1)) {
    if (winnerOf(state.z, taskId) === state.robotId) {
      state.y.set(taskId, 0);
      state.z.set(taskId, NO_WINNER);
    }
  }
  state.bundle = state.bundle.slice(0, cut);
  const releasedSet = new Set(released);
  state.path = state.path.filter((id) => !releasedSet.has(id));
  return released;
}

/**
 * Merge sender timestamps into the receiver after a message at `time`.
 * s[k] ← time; for other peers m, s[m] ← max(s[m], sender.s[m]).
 */
export function mergeTimestamps(state: ConsensusState, sender: ConsensusMessage): void {
  state.s.set(sender.from, sender.time);
  for (const [agent, ts] of sender.s) {
    if (agent === state.robotId) {
      continue;
    }
    if (agent === sender.from) {
      continue;
    }
    state.s.set(agent, Math.max(stampOf(state.s, agent), ts));
  }
}

/**
 * Apply one neighbor consensus message: Table I rules, timestamp merge,
 * then release-after-outbid cascade. Returns whether y/z or the bundle changed.
 */
export function applyConsensusMessage(state: ConsensusState, message: ConsensusMessage): boolean {
  if (message.from === state.robotId) {
    return false;
  }

  const taskIds = new Set<string>([...state.y.keys(), ...message.y.keys(), ...state.z.keys(), ...message.z.keys()]);
  let changed = false;

  for (const taskId of taskIds) {
    const action = consensusActionForTask(state.robotId, message.from, taskId, state, message);
    if (applyAction(state, taskId, action, message)) {
      changed = true;
    }
  }

  mergeTimestamps(state, message);

  const released = releaseOutbidTasks(state);
  if (released.length > 0) {
    changed = true;
  }

  return changed;
}

/** Snapshot y/z into the WinningBid list form used by tests / summaries. */
export function winningBidsFromState(state: ConsensusState): WinningBid[] {
  const bids: WinningBid[] = [];
  for (const [taskId, robotId] of state.z) {
    if (robotId === NO_WINNER) {
      continue;
    }
    bids.push({ taskId, robotId, bid: bidOf(state.y, taskId) });
  }
  return bids;
}

/**
 * Centralized one-shot conflict resolution over local tables (no timestamps).
 * For each task the highest bid wins; ties break by lexicographic robot id.
 * Used as a convenience aggregator; the networked algorithm uses
 * `applyConsensusMessage` instead.
 */
export function resolveConsensus(input: ConsensusInput): ConsensusResult {
  const best = new Map<string, WinningBid>();

  for (const table of input.localTables.values()) {
    for (const entry of table) {
      const current = best.get(entry.taskId);
      if (
        !current ||
        entry.bid > current.bid ||
        (entry.bid === current.bid && entry.robotId.localeCompare(current.robotId) < 0)
      ) {
        best.set(entry.taskId, entry);
      }
    }
  }

  const assignment = new Map<string, string>();
  for (const [taskId, entry] of best) {
    assignment.set(taskId, entry.robotId);
  }

  const updatedTables = new Map<string, WinningBid[]>();
  for (const robotId of input.localTables.keys()) {
    const mine: WinningBid[] = [];
    for (const [taskId, entry] of best) {
      if (entry.robotId === robotId) {
        mine.push(entry);
      }
    }
    updatedTables.set(robotId, mine);
  }

  return { assignment, updatedTables };
}
