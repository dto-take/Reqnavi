import type { FlowStep } from "@/actions/business-flow";

const LANE_HEIGHT = 90;
const STEP_WIDTH = 160;
const STEP_HEIGHT = 50;
const STEP_GAP_X = 40;
const LANE_LABEL_WIDTH = 110;
const TOP_MARGIN = 20;

export type FlowLayout = {
  lanes: string[];
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

export function computeSwimlaneLayout(steps: FlowStep[]): FlowLayout {
  const lanes = Array.from(new Set(steps.map((s) => s.role_lane ?? "未分類")));
  const laneIndex = new Map(lanes.map((l, i) => [l, i]));

  const positions = new Map<string, { x: number; y: number }>();
  for (const step of steps) {
    const x = LANE_LABEL_WIDTH + step.order_index * (STEP_WIDTH + STEP_GAP_X);
    const y = (laneIndex.get(step.role_lane ?? "未分類") ?? 0) * LANE_HEIGHT + TOP_MARGIN;
    positions.set(step.id, { x, y });
  }

  const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order_index)) : 0;
  const width = LANE_LABEL_WIDTH + (maxOrder + 1) * (STEP_WIDTH + STEP_GAP_X);
  const height = lanes.length * LANE_HEIGHT + TOP_MARGIN * 2;

  return { lanes, positions, width, height };
}

export const LAYOUT_CONSTANTS = { LANE_HEIGHT, STEP_WIDTH, STEP_HEIGHT, LANE_LABEL_WIDTH };
