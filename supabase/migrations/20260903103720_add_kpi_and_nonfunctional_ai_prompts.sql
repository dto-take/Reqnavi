insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_kpi_tree', 'D', 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、プロジェクトのKGI（最終ゴール）を1つ特定し、達成のための目標→戦略→戦術を階層的に整理してください。

資料に明記が無い階層は、資料全体の文脈から妥当な推測で補ってよい（この章は方向性を整理するための土台であり、後でSEが調整する前提）。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "goals": [
    {
      "text": "ゴールの内容",
      "objectives": [
        {
          "text": "目標の内容",
          "strategies": [
            { "text": "戦略の内容", "tactics": ["戦術1", "戦術2"] }
          ]
        }
      ]
    }
  ]
}

【資料抜粋】
{document_excerpts}',
true);

insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_nonfunctional_checklist', 'E', 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、非機能要件を「可用性」「性能拡張性」「運用保守性」「移植性」「セキュリティ」の5つの観点で整理してください。

資料に明記が無い観点については、Salesforce導入プロジェクトにおける一般的・標準的な観点で構わない（後でSEが確認・調整する前提）。チェック項目のステータスは、資料の内容に関わらず全て「未」とすること（達成状況の判定はこの場では行わない）。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "categories": [
    {
      "category": "可用性",
      "overview": "この観点の概要（1〜2文）",
      "checklist": [{ "item": "チェック項目の内容" }]
    }
  ]
}

【資料抜粋】
{document_excerpts}',
true);
