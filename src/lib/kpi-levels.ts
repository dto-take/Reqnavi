export const KPI_LEVELS = ["ゴール", "目標", "戦略", "戦術"] as const;
export type KpiLevel = (typeof KPI_LEVELS)[number];

export const KPI_LEVEL_DESCRIPTIONS: Record<KpiLevel, string> = {
  "ゴール": "達成したい最終的な状態",
  "目標": "ゴール達成のための具体的な指標",
  "戦略": "目標達成のための大きな方針",
  "戦術": "戦略を実行するための具体的な施策",
};
