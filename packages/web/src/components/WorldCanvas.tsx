/**
 * Canvas renderer for robots, tasks, assignment lines, dropped flashes, and
 * hovered robot bundle-path highlight.
 */

import type {
  CbbaAgent,
  RobotState,
  SimEvent,
  SimulationSnapshot,
  TaskState,
  Vec2,
} from "@swarmbid/sim";
import { useEffect, useRef } from "react";


const CELL = 22;
const PAD = 16;

interface Props {
  snapshot: SimulationSnapshot;
  agents: Map<string, CbbaAgent>;
  hoveredRobotId: string | null;
  onHoverRobot: (id: string | null) => void;
}

interface Flash {
  x: number;
  y: number;
  until: number;
}

function cellCenter(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: PAD + x * CELL + CELL / 2,
    cy: PAD + y * CELL + CELL / 2,
  };
}

export function WorldCanvas({ snapshot, agents, hoveredRobotId, onHoverRobot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashesRef = useRef<Flash[]>([]);

  useEffect(() => {
    if (snapshot.droppedMessageIds.length === 0) {
      return;
    }
    const now = performance.now();
    const dropEvents = snapshot.events.filter(
      (e: SimEvent): e is Extract<SimEvent, { kind: "message_dropped" }> =>
        e.kind === "message_dropped",
    );
    const latest = dropEvents.slice(-snapshot.droppedMessageIds.length);
    flashesRef.current = latest.map((ev) => {
      const sender = snapshot.world.robots.find((r: RobotState) => r.id === ev.message.from);
      return {
        x: sender?.position.x ?? 0,
        y: sender?.position.y ?? 0,
        until: now + 280,
      };
    });
  }, [snapshot.droppedMessageIds, snapshot.events, snapshot.world.robots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = snapshot.world;
    canvas.width = width * CELL + PAD * 2;
    canvas.height = height * CELL + PAD * 2;

    let frame = 0;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#1e2833";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x++) {
        ctx.beginPath();
        ctx.moveTo(PAD + x * CELL, PAD);
        ctx.lineTo(PAD + x * CELL, PAD + height * CELL);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath();
        ctx.moveTo(PAD, PAD + y * CELL);
        ctx.lineTo(PAD + width * CELL, PAD + y * CELL);
        ctx.stroke();
      }

      // Hovered robot path highlight
      if (hoveredRobotId) {
        const agent = agents.get(hoveredRobotId);
        const robot = snapshot.world.robots.find((r: RobotState) => r.id === hoveredRobotId);
        if (agent && robot) {
          const pathIds = agent.getPath();
          const points: Vec2[] = [robot.position];
          for (const id of pathIds) {
            const task = snapshot.world.tasks.find((t: TaskState) => t.id === id);
            if (task) {
              points.push(task.position);
            }
          }
          ctx.strokeStyle = "#3d9cf0";
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i < points.length; i++) {
            const p = points[i]!;
            const { cx, cy } = cellCenter(p.x, p.y);
            if (i === 0) {
              ctx.moveTo(cx, cy);
            } else {
              ctx.lineTo(cx, cy);
            }
          }
          ctx.stroke();
        }
      }

      // Assignment lines
      ctx.strokeStyle = "#6b8cae";
      ctx.lineWidth = 1.5;
      for (const robot of snapshot.world.robots) {
        for (const taskId of robot.assignedTaskIds) {
          const task = snapshot.world.tasks.find((t: TaskState) => t.id === taskId);
          if (!task) {
            continue;
          }
          const a = cellCenter(robot.position.x, robot.position.y);
          const b = cellCenter(task.position.x, task.position.y);
          ctx.beginPath();
          ctx.moveTo(a.cx, a.cy);
          ctx.lineTo(b.cx, b.cy);
          ctx.stroke();
        }
      }

      for (const task of snapshot.world.tasks) {
        const { cx, cy } = cellCenter(task.position.x, task.position.y);
        ctx.fillStyle = task.collectedBy ? "#5a4a20" : "#f0c14d";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 7, cy + 6);
        ctx.lineTo(cx - 7, cy + 6);
        ctx.closePath();
        ctx.fill();
      }

      for (const robot of snapshot.world.robots) {
        const { cx, cy } = cellCenter(robot.position.x, robot.position.y);
        const hovered = robot.id === hoveredRobotId;
        ctx.fillStyle = hovered ? "#3d9cf0" : "#5bd4a8";
        ctx.beginPath();
        ctx.arc(cx, cy, hovered ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0b1218";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(robot.id.replace("r", ""), cx, cy + 3);
      }

      flashesRef.current = flashesRef.current.filter((f) => f.until > now);
      for (const flash of flashesRef.current) {
        const { cx, cy } = cellCenter(flash.x, flash.y);
        const alpha = Math.max(0, (flash.until - now) / 280);
        ctx.fillStyle = `rgba(232, 93, 93, ${alpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [snapshot, agents, hoveredRobotId]);

  const onMove = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let found: string | null = null;
    for (const robot of snapshot.world.robots) {
      const { cx, cy } = cellCenter(robot.position.x, robot.position.y);
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= 12 * 12) {
        found = robot.id;
        break;
      }
    }
    onHoverRobot(found);
  };

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        aria-label="Simulation world"
        onMouseMove={onMove}
        onMouseLeave={() => onHoverRobot(null)}
      />
    </div>
  );
}
