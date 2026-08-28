"use client";

import { useState, useTransition } from "react";
import { moveFlowStep } from "@/actions/business-flow";
import { computeSwimlaneLayout, LAYOUT_CONSTANTS } from "@/lib/business-flow/layout";
import type { FlowStep, FlowEdge, FlowType } from "@/actions/business-flow";

const { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT } = LAYOUT_CONSTANTS;

export function SwimlaneDiagramEditor({
  projectId,
  flowType,
  steps,
  edges,
}: {
  projectId: string;
  flowType: FlowType;
  steps: FlowStep[];
  edges: FlowEdge[];
}) {
  const layout = computeSwimlaneLayout(steps);
  const [positions, setPositions] = useState(() => new Map(layout.positions));
  const [isPending, startTransition] = useTransition();

  function handlePointerDown(e: React.PointerEvent<SVGGElement>, stepId: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = positions.get(stepId)!;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(stepId, { x: orig.x + dx, y: orig.y + dy });
        return next;
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      commitMove(stepId);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function commitMove(stepId: string) {
    const pos = positions.get(stepId);
    if (!pos) return;

    const laneIdx = Math.max(0, Math.min(layout.lanes.length - 1, Math.round((pos.y - 20) / LANE_HEIGHT)));
    const newLane = layout.lanes[laneIdx];

    const ordered = steps
      .map((s) => ({ id: s.id, x: s.id === stepId ? pos.x : (positions.get(s.id)?.x ?? 0) }))
      .sort((a, b) => a.x - b.x)
      .map((s) => s.id);

    startTransition(() => {
      moveFlowStep(stepId, projectId, flowType, newLane, ordered);
    });
  }

  if (steps.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだステップがありません</div>;
  }

  return (
    <svg width={layout.width} height={layout.height} className="border border-border rounded-lg">
      {layout.lanes.map((lane, i) => (
        <g key={lane}>
          <rect x={0} y={i * LANE_HEIGHT} width={layout.width} height={LANE_HEIGHT} fill={i % 2 === 0 ? "var(--bg-sidebar)" : "var(--bg-page)"} />
          <text x={12} y={i * LANE_HEIGHT + LANE_HEIGHT / 2} fontSize={12} fill="var(--text-secondary)">{lane}</text>
        </g>
      ))}

      <defs>
        <marker id="arrow-editor" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
        </marker>
      </defs>

      {edges.map((edge, i) => {
        const from = positions.get(edge.from_node);
        const to = positions.get(edge.to_node);
        if (!from || !to) return null;
        return (
          <line
            key={i}
            x1={from.x + STEP_WIDTH}
            y1={from.y + STEP_HEIGHT / 2}
            x2={to.x}
            y2={to.y + STEP_HEIGHT / 2}
            stroke="var(--text-faint)"
            strokeWidth={1.5}
            markerEnd="url(#arrow-editor)"
          />
        );
      })}

      {steps.map((step) => {
        const pos = positions.get(step.id);
        if (!pos) return null;
        return (
          <g
            key={step.id}
            onPointerDown={(e) => handlePointerDown(e, step.id)}
            style={{ cursor: isPending ? "wait" : "grab" }}
          >
            <rect x={pos.x} y={pos.y} width={STEP_WIDTH} height={STEP_HEIGHT} rx={8} fill="var(--bg-page)" stroke="var(--border)" />
            <text x={pos.x + 10} y={pos.y + 20} fontSize={13} fill="var(--text-primary)">{step.label}</text>
            {step.system_used && (
              <text x={pos.x + 10} y={pos.y + 38} fontSize={11} fill="var(--text-faint)">{step.system_used}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
