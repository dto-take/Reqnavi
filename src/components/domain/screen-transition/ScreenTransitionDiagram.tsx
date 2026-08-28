import type { ScreenNode, ScreenEdge } from "@/actions/screen-transition";

const NODE_WIDTH = 150;
const NODE_HEIGHT = 50;
const GAP_X = 60;
const TOP_MARGIN = 30;

export function ScreenTransitionDiagram({ nodes, edges }: { nodes: ScreenNode[]; edges: ScreenEdge[] }) {
  if (nodes.length === 0) {
    return <div className="text-sm text-secondary py-6 text-center">まだ画面がありません</div>;
  }

  const positions = new Map(nodes.map((n) => [n.id, { x: n.order_index * (NODE_WIDTH + GAP_X), y: TOP_MARGIN }]));
  const width = nodes.length * (NODE_WIDTH + GAP_X);
  const height = TOP_MARGIN * 2 + NODE_HEIGHT + 40; // 遷移ラベル用に余白を確保

  return (
    <svg width={width} height={height} className="border border-border rounded-lg">
      <defs>
        <marker id="arrow-screen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const from = positions.get(edge.from_node);
        const to = positions.get(edge.to_node);
        if (!from || !to) return null;
        const midX = (from.x + NODE_WIDTH + to.x) / 2;
        return (
          <g key={edge.id}>
            <line
              x1={from.x + NODE_WIDTH} y1={from.y + NODE_HEIGHT / 2}
              x2={to.x} y2={to.y + NODE_HEIGHT / 2}
              stroke="var(--text-faint)" strokeWidth={1.5} markerEnd="url(#arrow-screen)"
            />
            {edge.label && (
              <text x={midX} y={from.y - 8} fontSize={11} fill="var(--text-secondary)" textAnchor="middle">
                {edge.label}
              </text>
            )}
          </g>
        );
      })}

      {nodes.map((node) => {
        const pos = positions.get(node.id)!;
        return (
          <g key={node.id}>
            <rect x={pos.x} y={pos.y} width={NODE_WIDTH} height={NODE_HEIGHT} rx={8} fill="var(--bg-page)" stroke="var(--border)" />
            <text x={pos.x + 10} y={pos.y + 28} fontSize={13} fill="var(--text-primary)">{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
