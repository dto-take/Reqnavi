insert into prompts (purpose, template_type, version, prompt_body, is_active) values
('extract_business_flow', null, 'v1',
'あなたはSIerの要件定義支援AIです。以下の資料から、業務プロセスの流れを、実行される順序どおりに整理してください。

各ステップについて、担当者（役割・部署名等）・処理内容・使用しているシステムやツールを特定してください。使用システムが資料に明記されていない場合はnullとしてください。

出力は以下のJSON形式のみとし、説明文は一切含めないこと。
{
  "steps": [
    { "role_lane": "担当者・役割", "label": "処理内容", "system_used": "使用システム、無ければnull" }
  ]
}

【資料抜粋】
{document_excerpts}',
true);
