/**
 * Discrete-time 2D grid world of robots and tasks.
 *
 * Initial placement is derived from the seed so the same WorldConfig always
 * yields the same starting layout. Motion is Manhattan-clamped to each
 * robot's speed and the grid bounds.
 */

import { createMulberry32, nextInt } from "./prng.js";
import type {
  MoveCommand,
  RobotState,
  TaskState,
  Vec2,
  WorldConfig,
  WorldState,
} from "./types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Build a fresh world from config. Robot/task positions and rewards are
 * sampled from the seeded PRNG.
 */
export function createWorld(config: WorldConfig): WorldState {
  const rng = createMulberry32(config.seed);
  const robots: RobotState[] = [];
  const tasks: TaskState[] = [];

  for (let i = 0; i < config.robotCount; i++) {
    robots.push({
      id: `r${i}`,
      position: {
        x: nextInt(rng, 0, config.width - 1),
        y: nextInt(rng, 0, config.height - 1),
      },
      speed: 1,
      assignedTaskId: null,
      assignedTaskIds: [],
    });
  }

  for (let i = 0; i < config.taskCount; i++) {
    tasks.push({
      id: `t${i}`,
      position: {
        x: nextInt(rng, 0, config.width - 1),
        y: nextInt(rng, 0, config.height - 1),
      },
      reward: nextInt(rng, 1, 100),
      collectedBy: null,
    });
  }

  return {
    tick: 0,
    width: config.width,
    height: config.height,
    robots,
    tasks,
    seed: config.seed,
  };
}

/** Apply move commands for one tick, clamping speed and bounds. */
export function applyMoves(world: WorldState, moves: MoveCommand[]): WorldState {
  const robots = world.robots.map((robot) => {
    const cmd = moves.find((m) => m.robotId === robot.id);
    if (!cmd) {
      return robot;
    }

    const dx = clamp(cmd.delta.x, -robot.speed, robot.speed);
    const dy = clamp(cmd.delta.y, -robot.speed, robot.speed);
    // Spend remaining speed budget on the axis with leftover after the other.
    let remX = Math.abs(dx);
    let remY = Math.abs(dy);
    if (remX + remY > robot.speed) {
      if (remX >= remY) {
        remX = robot.speed - remY;
      } else {
        remY = robot.speed - remX;
      }
    }

    const next: Vec2 = {
      x: clamp(robot.position.x + Math.sign(dx) * remX, 0, world.width - 1),
      y: clamp(robot.position.y + Math.sign(dy) * remY, 0, world.height - 1),
    };

    return { ...robot, position: next };
  });

  return { ...world, robots };
}

/**
 * Collect any uncollected task co-located with a robot. First robot wins
 * when multiple occupy the same cell (stable by robot id order).
 */
export function collectColocatedTasks(world: WorldState): {
  world: WorldState;
  collected: { taskId: string; robotId: string }[];
} {
  const collected: { taskId: string; robotId: string }[] = [];
  const robotsByPos = new Map<string, RobotState[]>();

  for (const robot of world.robots) {
    const key = `${robot.position.x},${robot.position.y}`;
    const list = robotsByPos.get(key) ?? [];
    list.push(robot);
    robotsByPos.set(key, list);
  }

  const tasks = world.tasks.map((task) => {
    if (task.collectedBy !== null) {
      return task;
    }
    const key = `${task.position.x},${task.position.y}`;
    const here = robotsByPos.get(key);
    if (!here || here.length === 0) {
      return task;
    }
    const winner = [...here].sort((a, b) => a.id.localeCompare(b.id))[0]!;
    collected.push({ taskId: task.id, robotId: winner.id });
    return { ...task, collectedBy: winner.id };
  });

  return { world: { ...world, tasks }, collected };
}

export function advanceTick(world: WorldState): WorldState {
  return { ...world, tick: world.tick + 1 };
}

export { manhattan };
