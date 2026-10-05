# Server Actionの失敗経路の洗い出し（2026-10-05）

- (A) 戻り値で返す: 13件 / (B) throwする: 114件（読み取り系・内部用を含む）
- (B)のうち、利用者に見せる日本語の文言（UserFacingError）を持つ操作: 33件
- 呼び出し方: form＝formのactionに直接渡す（throw→エラー境界）、client呼出＝クライアントのtry/catch（トースト）、server＝ページ描画中に呼ぶ（throw→エラー境界）

## (A) 戻り値で返す

- admin-users.ts#createPartnerAccount（form）
- ai-draft-business-flow.ts#generateBusinessFlowDraft（form）
- ai-draft-kpi.ts#generateKpiDraft（form）
- ai-draft.ts#generateDraft（form+client呼出）
- ambiguous-check.ts#runAmbiguousCheckAI（form）
- documents.ts#reclassifyDocument（form）
- effort-logs.ts#createEffortLog（form）
- platform-suggestion.ts#suggestPlatformFeature（client呼出）
- user-management.ts#createUserAccount（form）
- workflow-builder.ts#updateFlowNode（client呼出）
- workflow-builder.ts#insertWorkflowNodeAfter（form+client呼出）
- workflow-builder.ts#deleteWorkflowNode（client呼出）
- workflow-builder.ts#deleteConditionNode（client呼出）

## (B) 利用者に具体的な日本語を見せる必要がある操作

| 操作 | 呼び出し方 | 文言の種類 | 文言の例 |
|---|---|---|---|
| admin-users#addProjectMemberByEmail | form | 権限・対象なし・重複 | PM以上の権限が必要です / 指定されたメールアドレスのユーザーが見つかりません |
| baseline#createBaseline | form | 権限・その他 | PM以上の権限が必要です / 認証が必要です |
| business-flow#addFlowStep | form | その他 | 認証が必要です |
| change-detection#raiseChangeRequest | form | その他・権限・入力不正 | 認証が必要です / 認証が必要です |
| cross-project-reference#copyReferenceItem | form | その他・対象なし・ロック | 認証が必要です / 案件が見つかりません |
| flow-diff#proposeFunctionalRequirements | form | その他 | 認証が必要です |
| kpi-tree#updateKpiNodeField | client呼出 | ロック | 確定済みの項目は編集できません |
| kpi-tree#suggestKpiCandidates | client呼出 | 入力不正 | AIの出力形式が不正でした。 |
| kpi-tree#moveKpiNodeUpDown | client呼出 | ロック | 確定済みの項目は並び替えできません |
| kpi-tree#changeKpiNodeLevel | client呼出 | ロック・その他 | 確定済みの項目は階層変更できません / これ以上、階層を上げられません（ゴールは案件内に1件のみ |
| kpi-tree#duplicateKpiNode | client呼出 | ロック | 確定済みの項目は複製できません |
| nonfunctional#createCustomAspect | client呼出 | 入力不正 | 観点名を入力してください |
| nonfunctional#unadoptAspect | client呼出 | その他 | 採用中の観点を0件にはできません。 |
| nonfunctional#updateAspectPolicy | client呼出 | その他 | 観点以外の方針は編集できません / この観点は編集できません |
| nonfunctional#addCheckItem | client呼出 | 入力不正 | チェック項目の内容を入力してください |
| nonfunctional#suggestNonfunctionalCandidates | client呼出 | 入力不正 | AIの出力形式が不正でした。 |
| organizations#createOrganization | form | 権限 | PM以上の権限が必要です |
| progress-tasks#updateProgressTaskField | client呼出 | その他 | 大工程の期間・担当は中工程から自動集計されるため、直接編 / 終了日は開始日以降にしてください |
| progress-tasks#deleteProgressTask | client呼出 | その他 | 配下に中工程が残っているため削除できません。先に中工程を |
| progress-tasks#setPredecessor | client呼出 | その他 | 大工程には先行工程を設定できません / 自分自身を先行工程には設定できません |
| progress-tasks#shiftTaskDates | client呼出 | その他 | 終了日は開始日以降にしてください / 大工程の期間は中工程から自動集計されるため、直接編集でき |
| project-settings#toggleCrossProjectReference | form | 権限 | PM以上の権限が必要です |
| project-settings#updateSelectedChapters | form | 権限 | PM以上の権限が必要です |
| projects#deleteProject | form(client) | 権限・対象なし・入力不正・その他 | この操作には管理者権限が必要です / 案件が見つかりません |
| requirement-items#moveItemToGroup | client呼出 | 対象なし | 対象の項目が見つかりません |
| requirement-items#markAsExceptionApproved | client呼出 | 入力不正 | 理由の入力が必須です |
| screen-flow-suggestions#generateScreenFlowSuggestions | client呼出 | その他・入力不正 | 認証が必要です / 画面情報を持つ9章の機能要件がありません。先に9章で画面 |
| screen-flow-suggestions#adoptScreenSuggestion | client呼出 | その他 | 認証が必要です |
| screen-flow-suggestions#adoptAllScreenSuggestions | client呼出 | その他 | 認証が必要です |
| screen-transition#addScreenNode | client呼出 | その他 | 認証が必要です |
| screen-transition#renameScreenNode | client呼出 | 入力不正 | 画面名を入力してください |
| screen-transition#moveScreenNodes | client呼出 | その他 | 位置を保存できなかった画面があります（${updated |
| user-management#updateUserRole | form | ロック・入力不正 | 自分自身のロールはこの画面から変更できません / 不正なロールです: ${newRole} |
