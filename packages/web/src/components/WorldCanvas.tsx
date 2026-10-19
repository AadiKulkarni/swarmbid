/**
 * Canvas renderer for robots, tasks, assignment lines, and dropped-message flashes.
 */

import type { SimulationSnapshot } from "@swarmbid/sim";
import { useEffect, useRef } from "react";

const CELL = 22;
const PAD = 16;

interface Props {
  snapshot: SimulationSnapshot;
}

interface Flash {
  x: number;
  y: number;
  until: number;
}

export function WorldCanvas({ snapshot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashesRef = useRef<Flash[]>([]);

  useEffect(() => {
    if (snapshot.droppedMessageIds.length === 0) {
      return;
    }
    const now = performance.now();
    const dropEvents = snapshot.events.filter((e) => e.kind === "message_dropped");
    const latest = dropEvents.slice(-snapshot.droppedMessageIds.length);
    flashesRef.current = latest.map((ev) => {
      if (ev.kind !== "message_dropped") {
        return { x: 0, y: 0, until: now + 280 };
      }
      const sender = snapshot.world.robots.find((r) => r.id === ev.message.from);
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

      // Grid
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

      const cellCenter = (x: number, y: number) => ({
        cx: PAD + x * CELL + CELL / 2,
        cy: PAD + y * CELL + CELL / 2,
      });

      // Assignment lines
      ctx.strokeStyle = "#6b8cae";
      ctx.lineWidth = 1.5;
      for (const robot of snapshot.world.robots) {
        if (!robot.assignedTaskId) {
          continue;
        }
        const task = snapshot.world.tasks.find((t) => t.id === robot.assignedTaskId);
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

      // Tasks
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

      // Robots
      for (const robot of snapshot.world.robots) {
        const { cx, cy } = cellCenter(robot.position.x, robot.position.y);
        ctx.fillStyle = "#5bd4a8";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#0b1218";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(robot.id.replace("r", ""), cx, cy + 3);
      }

      // Dropped-message red flashes
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
  }, [snapshot]);

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} aria-label="Simulation world" />
    </div>
  );
}
