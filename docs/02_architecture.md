# 02 アーキテクチャ設計書（ReqNavi）

| 項目 | 内容 |
|------|------|
| 文書バージョン | 1.0 |
| 作成日 | 2026-07-30 |
| 対象フェーズ | Phase 1 (MVP) |
| 関連文書 | ReqNavi_要件定義書.docx |

---

## 1. システム構成の概要

本システムは **Supabase (BaaS) + Next.js 15 (App Router) + Vercel** を基盤とし、AI API（Gemini/Claude）と連携するアーキテクチャを採る。社内の別プロジェクト（PM Vision）と同一スタックを採用し、実装・運用の知見を流用する。

- **フロントエンド**: Next.js 15 (App Router) を Vercel にデプロイ。Server Components + Server Actions を主とする。
- **BaaS (Supabase)**: PostgreSQL + RLS、Supabase Auth、Storage（資料格納）、Realtime（打合せ同席モードの即時反映）、Edge Functions。
- **AI 基盤**: AI API は Edge Functions / Server Actions 経由でのみ呼び出す。APIキーをブラウザに露出しない。学習に利用しないことが確認できる契約のAPIを前提とする。

---

## 2. データモデル

### 2.1 組織・案件・ユーザー

```sql
-- 顧客企業（案件の発注元）※companiesとは別概念
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  industry   text,
  created_at timestamptz default now()
);

-- ユーザーの所属会社（自社 or 外注/パートナー会社）※organizationsとは別概念
create table companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  company_type text not null check (company_type in ('own','partner'))
);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  tenant_id      uuid not null, -- 現状は自社固定値。将来のマルチテナント化に備える
  name           text not null,
  allow_cross_project_reference boolean default false,
  created_at     timestamptz default now()
);

create table project_members (
  project_id uuid references projects(id),
  user_id    uuid references auth.users(id),
  primary key (project_id, user_id)
);
```

### 2.2 要件項目（5テンプレート共通）

```sql
create table requirement_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id),
  tenant_id       uuid not null,
  chapter_no      int  not null,              -- 1〜15
  template_type   text not null,               -- 'A'|'B'|'C'|'D'|'E'
  parent_id       uuid references requirement_items(id), -- D.階層ツリー型のみ使用
  order_index     int  not null default 0,
  content         jsonb not null default '{}', -- テンプレート別の中身
  status          text not null default 'ai_draft', -- ai_draft/se_reviewing/confirmed/exception_approved
  ambiguous_flags jsonb default '[]',
  exception_reason text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table chapter_column_templates (
  template_type text not null,
  column_key    text not null,
  label         text not null,
  data_type     text not null, -- text/select/number/date
  order_index   int not null,
  primary key (template_type, column_key)
);

create table source_documents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id),
  file_name       text not null,
  storage_path    text not null,
  classified_tags jsonb default '[]'
);

create table item_sources (
  item_id  uuid references requirement_items(id),
  source_id uuid references source_documents(id),
  location_note text,
  primary key (item_id, source_id)
);

create table item_history (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid references requirement_items(id),
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz default now(),
  before_status text,
  after_status  text,
  input_mode    text -- 'direct_input'|'minutes_import'
);
```

### 2.3 グラフ型（業務フロー・画面遷移）・ガント型（進捗）

```sql
create table flow_nodes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  flow_type  text not null, -- 'business_asis'|'business_tobe'|'screen_transition'
  label      text not null,
  role_lane  text,
  pos_x int, pos_y int
);

create table flow_edges (
  id        uuid primary key default gen_random_uuid(),
  from_node uuid references flow_nodes(id),
  to_node   uuid references flow_nodes(id),
  label     text
);

create table progress_tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id),
  task_name        text not null,
  owner_primary    text, owner_secondary text,
  week_start date, week_end date,
  percent_complete int default 0
);
```

### 2.4 ベースライン・変更管理

```sql
create table baseline_snapshots (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id),
  version_no    text not null,
  status        text not null default 'active', -- active | superseded
  approved_by   uuid references auth.users(id),
  approval_note text,
  readiness_snapshot jsonb,
  created_at    timestamptz default now()
);

create table baseline_item_snapshots (
  id            uuid primary key default gen_random_uuid(),
  baseline_id   uuid references baseline_snapshots(id),
  item_id       uuid not null,
  chapter_no    int,
  template_type text,
  content       jsonb,
  status_at_baseline text
);

create table change_requests (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id),
  baseline_id    uuid references baseline_snapshots(id),
  item_id        uuid references requirement_items(id),
  change_type    text, -- added/modified/deleted
  before_content jsonb,
  after_content  jsonb,
  reason         text,
  estimation_impact text, -- ※パートナーには不可視
  raised_by      uuid references auth.users(id),
  status         text default 'open',
  raised_at      timestamptz default now()
);
```

### 2.5 AI連携

```sql
create table prompts (
  id            uuid primary key default gen_random_uuid(),
  purpose       text not null,      -- extract_template_b / ambiguity_check_l2 / conflict_check 等
  template_type text,
  version       text not null,
  prompt_body   text not null,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table ai_interactions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id),
  prompt_id   uuid references prompts(id),
  input_summary jsonb,
  output       jsonb,
  created_at  timestamptz default now()
);

create table ai_reconciliation_suggestions (
  id                   uuid primary key default gen_random_uuid(),
  triggered_by_item_id uuid references requirement_items(id),
  target_item_id       uuid references requirement_items(id),
  suggested_content     jsonb,
  reason                text,
  status                text default 'pending', -- pending/accepted/rejected
  created_at            timestamptz default now()
);
```

---

## 3. 認証フロー（PM Vision 準拠）

| ユーザー種別 | 認証方式 |
|---|---|
| 自社メンバー（partner以外） | Google OAuth または メール/パスワード |
| パートナー（外注SE） | メール/パスワードのみ |

DB制約: `(auth_provider = 'google' AND user_role != 'partner') OR (auth_provider = 'email')`

### JWTカスタムクレーム（`custom-access-token-hook`で付与）

```json
{
  "tenant_id":  "uuid",  // 現状は自社固定値
  "user_role":  "pm",    // ※"role"ではなく"user_role"（Supabase予約語と衝突するため）
  "company_id": "uuid"   // companiesテーブル参照（自社 or パートナー会社）
}
```

### ロール一覧（ReqNaviでの意味）

| ロール | 権限概要 |
|---|---|
| admin | companies/usersの管理 |
| exec | 全案件のKPI・工数削減実績ダッシュボード閲覧のみ |
| pmo | 複数案件横断の確定判定状況の監視（Phase4） |
| pm | 案件PM。確定判定ゲートの最終承認権限 |
| member | 案件担当SE。通常の素案生成・リファインメント操作 |
| partner | 外注SE。制限付きアクセス |

### パートナー制限（アプリ側・DB側の両方で実装）

- アサインされた案件（`project_members`）のみ参照可
- `change_requests.estimation_impact` 等のコスト関連項目への参照を遮断
- Phase4の組織横断ダッシュボードは常に403
- Google OAuthでのログイン不可

---

## 4. RLSの基本パターン

```sql
create policy "reqnavi_access" on requirement_items
  for select using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7) -- コスト関連色の強い章
    )
  );

create policy "estimation_impact_partner_block" on change_requests
  for select using (
    (auth.jwt() ->> 'user_role') != 'partner'
    or estimation_impact is null
  );
```

---

## 5. AI呼び出しフロー

### 5.1 Flow 1（初期構築）／Flow 2（差分最適化）

共通のコア関数 `reconcile(newInfo, existingRelatedItems)` を用いる。

- **Flow 1**：`existingRelatedItems = []` で呼び出し、全て`ai_draft`として新規保存
- **Flow 2**：既存の関連項目（確定済み含む）を渡し、確定済み項目は上書き提案せず`ai_reconciliation_suggestions`として提案のみ行う

### 5.2 トリガー（ボタン起点・自動発火なし）

| ボタン | 実行範囲 |
|---|---|
| この項目を確認 | 単一項目＋依存関係マップ上の直接関連項目 |
| この章を最適化 | 章内の全項目 |
| 全体整合性チェック | 案件全体（確定判定ゲートと同一操作） |
| 同一顧客の他案件と照合 | 同一organization_id配下の他プロジェクト（`allow_cross_project_reference`がtrueの場合のみ） |

### 5.3 曖昧表現検出

- 段階1：辞書ベース（常時実行、AI呼び出し不要）
- 段階2：AI文脈判定（確定判定実行時のみ、コスト抑制のため）

---

## 6. Phase別開発スコープ（要件定義書 §3 ロードマップと対応）

| Phase | 主な実装対象（本設計書との対応） |
|---|---|
| Phase 0 | organizations / companies / projects / project_members、認証（3節）、RLS基礎（4節） |
| Phase 1 | requirement_items / chapter_column_templates / source_documents、Flow 1（5.1節）、辞書ベース曖昧検出 |
| Phase 2 | flow_nodes / flow_edges、progress_tasks |
| Phase 3 | baseline_snapshots 系、ai_reconciliation_suggestions、Flow 2、確定判定ダッシュボード |
| Phase 4 | allow_cross_project_reference の運用、同一顧客内の他案件照合 |

---

## 7. 開発環境・デプロイ構成

既存の社内アーキ資産（PM Vision）と同様、以下を踏襲する。

| 環境 | 用途 |
|---|---|
| ローカル開発 | `supabase start` (Docker) + `next dev` |
| Preview | PRごとの動作確認（Vercel Preview + Supabase Staging） |
| Staging | 結合テスト・UAT |
| Production | 本番 |

CI/CD: Feature ブランチ→PR→GitHub Actions（リント/型チェック/RLSテスト）→Vercel Preview→レビュー承認→mainマージ→本番デプロイ→`supabase db push`（手動ゲート）。
