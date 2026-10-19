/**
 * Robot controller interface.
 *
 * Controllers are pure functions: given the local robot state, a read-only
 * world snapshot, and the current inbox, they return move commands and
 * outgoing messages. The simulation loop owns mutation and networking.
 */

import type { RobotAction, RobotController, RobotTickInput } from "./types.js";

export type { RobotAction, RobotController, RobotTickInput };

/**
 * Invoke a robot controller for one tick.
 * Thin wrapper kept so call sites stay uniform and testable.
 */
export function onTick(controller: RobotController, input: RobotTickInput): RobotAction {
  return controller(input);
}

/**
 * Default no-op controller — stays put and sends nothing.
 * Useful as a placeholder until auction-aware controllers are wired in.
 */
export const idleController: RobotController = () => ({
  moves: [],
  outgoingMessages: [],
});
