import { computeSwimlaneLayout, LAYOUT_CONSTANTS } from "@/lib/business-flow/layout";
import type { FlowStep, FlowEdge } from "@/actions/business-flow";

const { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT } = LAYOUT_CONSTANTS;

export function SwimlaneDiagram({ steps, edges }: { steps: FlowStep[]; edges: FlowEdge[] }) {
  if (steps.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだステップがありません</div>;
  }

  const layout = computeSwimlaneLayout(steps);
  const positionOf = (id: string) => layout.positions.get(id)!;

  return (
    <svg width={layout.width} height={layout.height} className="border border-border rounded-lg">
      {/* レーン背景（1つおきに色を変える） */}
      {layout.lanes.map((lane, i) => (
        <g key={lane}>
          <rect
            x={0}
            y={i * LANE_HEIGHT}
            width={layout.width}
            height={LANE_HEIGHT}
            fill={i % 2 === 0 ? "var(--bg-sidebar)" : "var(--bg-page)"}
          />
          <text x={12} y={i * LANE_HEIGHT + LANE_HEIGHT / 2} fontSize={12} fill="var(--text-secondary)">
            {lane}
          </text>
        </g>
      ))}

      {/* 矢印マーカー定義 */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
        </marker>
      </defs>

      {/* エッジ（ステップ間の矢印） */}
      {edges.map((edge, i) => {
        const from = positionOf(edge.from_node);
        const to = positionOf(edge.to_node);
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
            markerEnd="url(#arrow)"
          />
        );
      })}

      {/* ステップボックス */}
      {steps.map((step) => {
        const pos = positionOf(step.id);
        return (
          <g key={step.id}>
            <rect
              x={pos.x}
              y={pos.y}
              width={STEP_WIDTH}
              height={STEP_HEIGHT}
              rx={8}
              fill="var(--bg-page)"
              stroke="var(--border)"
            />
            <text x={pos.x + 10} y={pos.y + 20} fontSize={13} fill="var(--text-primary)">
              {step.label}
            </text>
            {step.system_used && (
              <text x={pos.x + 10} y={pos.y + 38} fontSize={11} fill="var(--text-faint)">
                {step.system_used}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
