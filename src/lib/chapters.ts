export const CHAPTER_NAMES: Record<number, string> = {
  1: "お客様概要", 2: "プロジェクトの目的", 3: "ロードマップ", 4: "KPI",
  5: "システム要件", 6: "開発スコープ", 7: "ビジネス要件", 8: "業務要件",
  9: "機能要件", 10: "非機能要件", 11: "データ移行要件", 12: "トレーニング要件",
  13: "システム運用要件", 14: "システム定着化支援要件", 15: "進捗",
};

// テンプレートA/B/C（フラットな行構造）を使う章のみ。4(D)・10(E)・15(ガント)は含めない
export const CHAPTER_TEMPLATE_MAP: Record<number, string> = {
  1: "C", 2: "C", 3: "C",
  5: "A", 6: "C", 7: "A", 8: "C", 9: "C",
  11: "B", 12: "C", 13: "B", 14: "B",
};

// 注意：このリストを変更した場合、`prompts`テーブルのpurpose='classify_document'の
// カテゴリ一覧も必ず同時に更新すること（DBに保存されたプロンプト本文のため、
// このファイルをimportするだけでは自動反映されない）。

// 案件トップ画面のステップリスト表示専用の分類。chapter_column_templates等の
// テンプレート分類（A〜E）とは無関係で、データモデルには一切影響しない。
export const CHAPTER_GROUPS: { label: string; chapters: number[] }[] = [
  { label: "基本情報", chapters: [1, 2, 3, 4] },
  { label: "要件定義", chapters: [5, 6, 7, 8, 9, 10, 11] },
  { label: "運用・定着", chapters: [12, 13, 14] },
  { label: "進捗管理", chapters: [15] },
];
