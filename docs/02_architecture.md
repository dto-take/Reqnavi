# 02 アーキテクチャ設計書（ReqNavi）

| 項目 | 内容 |
|------|------|
| 文書バージョン | 1.0 |
| 作成日 | 2026-07-30 |
| 対象フェーズ | Phase 1 (MVP) |
| 関連文書 | ReqNavi_要件定義書.docx |

---

## 1. システム構成の概要

本システムは **Supabase (BaaS) + Next.js 15 (App Router) + Vercel** を基盤とし、AI API（**Gemini、`@google/genai`公式SDK。gemini-3.6-flashを使用（gemini-2.5-flashがGoogle側で廃止されたため2026-08-26に移行）**）と連携するアーキテクチャを採る。社内の別プロジェクト（PM Vision）と同一スタックを採用し、実装・運用の知見を流用する。

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

create table user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  tenant_id     uuid not null,
  user_role     text not null check (user_role in ('admin','exec','pmo','pm','member','partner')),
  company_id    uuid references companies(id),
  auth_provider text not null check (auth_provider in ('google','email')),
  force_password_reset boolean not null default false,
  display_name  text,
  created_at    timestamptz default now(),
  constraint partner_no_google check (
    (auth_provider = 'google' and user_role != 'partner') or (auth_provider = 'email')
  )
);

create table project_members (
  project_id uuid references projects(id),
  user_id    uuid references user_profiles(user_id), -- ※PostgREST埋め込みJOINのためauth.usersではなくuser_profilesを参照（4章参照）
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
  pos_x int, pos_y int -- ※Phase2 Step1〜3では未使用。座標はrole_lane（レーン）とorder_index（順序）のみで表現し、
                        -- pixel座標は都度layout.ts側で計算する方式を採用したため、この2列への永続化は行っていない
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
  tenant_id        uuid not null,
  task_name        text not null,
  owner_primary    text, owner_secondary text,
  week_start       date not null,
  week_end         date not null,
  percent_complete int not null default 0 check (percent_complete between 0 and 100),
  constraint valid_task_range check (week_end >= week_start)
);
```

**Phase2 Step7の実機検証で発覚**：当初のこの定義は`init_schema.sql`で作成されたのみで、RLSポリシー・GRANTが1件も無く、機能として完全に使用不可能な状態だった（規約12・23と同種だが、テーブル作成からRLS整備まで最も期間が空いた例）。RLS・GRANTは4章に記載の通り整備済み。

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
  item_id        uuid references requirement_items(id) on delete set null, -- 項目削除後も業務記録として行は残す
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

### 2.6 プラットフォーム知識セット（Salesforce特化・差し替え可能設計）

Phase1はSalesforce特化でAI素案生成の精度を最大化するが、プラットフォーム固有知識（標準オブジェクト・標準機能とのマッピング）はコードに直書きせず、テーブルとして分離する。将来的に他プラットフォーム（kintone等）へ対応する場合は、知識セットを追加・切替するだけで対応できる設計とする。

```sql
create table platform_knowledge_sets (
  id            uuid primary key default gen_random_uuid(),
  platform_name text not null,       -- 'salesforce' 等
  is_active     boolean default true,
  created_at    timestamptz default now()
);

create table platform_feature_mappings (
  id                     uuid primary key default gen_random_uuid(),
  knowledge_set_id       uuid references platform_knowledge_sets(id),
  requirement_pattern    text not null,   -- 例:「商談管理」「承認フロー」
  standard_feature       text,             -- 例:「Opportunity」「Approval Process」
  requires_customization boolean default false,
  notes                  text
);

-- projectsに紐付け（案件ごとに採用する知識セットを選択。Phase1はsalesforce固定でよい）
-- projectsに紐付け（案件ごとに採用する知識セットを選択。Phase1はsalesforce固定のためdefaultを設定し、
-- 既存行へのバックフィルと合わせて新規行の漏れを防ぐ（CLAUDE.md規約24）
alter table projects add column platform_knowledge_set_id uuid references platform_knowledge_sets(id)
  default '00000000-0000-0000-0000-0000000000f1';
```

テンプレートC（項目一覧型：業務要件・機能要件等）の列構成には、`platform_feature`（対応機能／SFDC機能）列を追加し、`chapter_column_templates`に登録する。Flow 1（初期構築）のテンプレートC用プロンプトは、`platform_feature_mappings`の内容をコンテキストとして注入し、標準機能での対応可否・カスタム開発要否を素案に含める。

**Phase2 Step5で追加**：同じくテンプレートCに、画面ワイヤーフレーム生成用の`screen_pattern`（画面パターン）・`screen_fields`（表示項目）・`screen_actions`（操作）列を追加。9章（機能要件）で画面を表す行のみ使用し、他章（6・8・12）では空欄のままでよい。新規テーブルは不要で、既存の`chapter_column_templates`RLSをそのまま利用する。ワイヤーフレーム描画は現状「一覧」パターンのみ対応（`src/components/domain/screen-wireframe/ScreenWireframe.tsx`）。

---

## 3. 認証フロー（PM Vision 準拠）

| ユーザー種別 | 認証方式 |
|---|---|
| 自社メンバー（partner以外） | Google OAuth または メール/パスワード |
| パートナー（外注SE） | メール/パスワードのみ |

DB制約: `(auth_provider = 'google' AND user_role != 'partner') OR (auth_provider = 'email')`

### JWTカスタムクレーム（`custom_access_token_hook`で付与）

**実装方式：Postgres関数方式を採用する（Edge Function方式は不採用）。** `user_profiles`テーブル（user_id/tenant_id/user_role/company_id/auth_provider等）を参照し、JWT発行時にクレームへ付与する。`supabase/config.toml`の登録は`uri = "pg-functions://postgres/public/custom_access_token_hook"`形式となる。

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

**重要**：以下のRLS作成に加えて、CLIマイグレーションのみでテーブルを作成する場合は`grant`文が別途必須（Studioの自動GRANTが適用されないため、RLS以前の段階で全操作が拒否される）。また、テーブルが自テーブルを自己参照する形でポリシー条件を書くと無限再帰（`42P17`）になるため、`security definer`のヘルパー関数を経由する。

```sql
-- 自己参照を避けるためのヘルパー関数（例：project_membersの場合）
create or replace function is_project_member(target_project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from project_members
    where project_id = target_project_id and user_id = auth.uid()
  );
$$;

create policy "project_members_select" on project_members
  for select using (
    is_project_member(project_id)
    or (auth.jwt() ->> 'user_role') in ('admin','exec','pmo')
  );

-- 修正版（認証・メンバー管理の作り忘れ解消で発覚・修正）：当初はuser_roleのみの検証で、
-- 対象案件のメンバーかどうかを見ていなかったため、admin/pmであれば他案件にも越境してメンバー登録できてしまっていた
create policy "project_members_insert" on project_members
  for insert with check (
    (auth.jwt() ->> 'user_role') in ('admin','pm')
    and is_project_member(project_id)
  );

-- 上記のinsertポリシーは「対象案件の既存メンバーであること」を要求するため、
-- 案件作成直後・最初のメンバー（作成者自身）を登録する場面では自己矛盾を起こす（規約31）。
-- この1箇所（createProject内）に限り、service_roleクライアント経由で登録する。

-- 新規テーブル作成時は、RLS有効化・ポリシー作成に加えて必ずGRANTを行う
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on <table_name> to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
```

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

-- SELECTと同一の可視条件をINSERT/UPDATEにも適用する（Phase1 Step2の実機検証で発覚：
-- 元々SELECTのみ定義されており、行追加・編集・確定操作がすべてRLSで拒否されていた）
create policy "reqnavi_insert" on requirement_items
  for insert with check (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

create policy "reqnavi_update" on requirement_items
  for update using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

-- Phase1 Step4（KPIツリーのノード削除）で必要になり追加
create policy "reqnavi_delete" on requirement_items
  for delete using (
    (auth.jwt() ->> 'tenant_id')::uuid = tenant_id
    and project_id in (select project_id from project_members where user_id = auth.uid())
    and not (
      (auth.jwt() ->> 'user_role') = 'partner'
      and chapter_no in (7)
    )
  );

-- Phase1 Step5（AI素案生成）で必要になり追加。
-- item_sourcesはproject_idを直接持たないため、requirement_items経由でis_project_member判定する
grant select, insert, update, delete on item_sources to authenticated;

create policy "item_sources_select" on item_sources
  for select using (
    item_id in (select id from requirement_items where is_project_member(project_id))
  );

create policy "item_sources_insert" on item_sources
  for insert with check (
    item_id in (select id from requirement_items where is_project_member(project_id))
  );

-- 修正版（Phase3 Step5の実機検証で発覚）：当初の設計は「estimation_impactがnullでない場合、
-- 行全体をパートナーから非表示にする」という意図しない挙動になっていた（RLSは行単位のみで、
-- 列単位のマスキングはできないため）。これによりreason等の他フィールドまで一律に見えなくなっていた。
-- 正しい対処は、SELECTポリシー自体は通常のis_project_memberベースにし、
-- 列のマスキングはアプリケーション層（listChangeRequests等）で行う。
create policy "change_requests_select" on change_requests
  for select using (is_project_member(project_id));
-- estimation_impact列のマスキングはアプリケーション層で行う（規約34参照）。
-- 「estimation_impact_partner_block」という行単位ポリシーは廃止した。
```

**実装上の注意（Phase0 Step3の実機検証より）**：
- 行を作成した本人がその行を作成直後に読み返す実装（`.insert().select()`等）は、関連する紐付けレコード（例：`project_members`）がまだ存在しない段階でSELECTポリシーに阻まれ失敗することがある（RETURNINGはSELECT権限を要求するため）。IDをクライアント側で採番するか`.select()`を使わない実装にすること。
- `user_profiles`は本人のみ閲覧可が基本方針だが、同一案件のメンバー同士は互いのプロフィール（表示名・ロール）を閲覧できる必要があるため、以下の許可ポリシーを追加する（既存の本人限定ポリシーとOR条件で併存）。
- PostgRESTの埋め込みJOIN（`select("...profile(...)")`等）を使う場合、対象テーブル間に直接の外部キーが必要。`project_members.user_id`は`user_profiles.user_id`を参照するようFKを設定する（`user_profiles.user_id`は`auth.users(id)`への参照を維持しているため、整合性は間接的に保たれる）。

```sql
create policy "user_profiles_select_co_members" on user_profiles
  for select using (
    user_id in (
      select pm2.user_id from project_members pm1
      join project_members pm2 on pm1.project_id = pm2.project_id
      where pm1.user_id = auth.uid()
    )
  );

-- 【重要・セキュリティ】user_roleを保護するトリガー（規約39参照）。
-- 「本人の行なら更新可」ポリシー（force_password_reset自己解除用）と、
-- ユーザ管理機能のための grant update (user_role) を組み合わせた際、
-- 一般ユーザーが自分自身のuser_roleをadminに書き換えられる脆弱性が実際に発生した。
-- RLS/GRANTの組み合わせに依存しない最終防衛線としてトリガーで保護する。
create or replace function protect_user_role_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_role is distinct from old.user_role
     and (auth.jwt() ->> 'user_role') != 'admin' then
    raise exception 'user_roleの変更には管理者権限が必要です';
  end if;
  return new;
end;
$$;

create trigger protect_user_role
  before update on user_profiles
  for each row execute function protect_user_role_column();

-- Phase2 Step1（業務フロー）で追加。flow_edgesはproject_idを直接持たないため、
-- flow_nodes経由でis_project_memberを参照する（CLAUDE.md規約21）
create policy "flow_nodes_select" on flow_nodes for select using (is_project_member(project_id));
create policy "flow_nodes_insert" on flow_nodes for insert with check (is_project_member(project_id));
create policy "flow_nodes_update" on flow_nodes for update using (is_project_member(project_id));
create policy "flow_nodes_delete" on flow_nodes for delete using (is_project_member(project_id));

-- 重要（Phase2 Step6の実機検証で発覚）：from_node/to_nodeの両方を検証すること。
-- from_nodeのみの検証だと、to_nodeに他案件のノードIDを指定した越境edgeが作成できてしまう
create policy "flow_edges_select" on flow_edges for select using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_insert" on flow_edges for insert with check (
  from_node in (select id from flow_nodes where is_project_member(project_id))
  and to_node in (select id from flow_nodes where is_project_member(project_id))
);
create policy "flow_edges_delete" on flow_edges for delete using (
  from_node in (select id from flow_nodes where is_project_member(project_id))
);

-- Phase2 Step7（進捗ガントチャート）で整備。作成自体はPhase0のinit_schema.sqlだったが、
-- RLS・GRANTが長期間未整備のまま機能として使用不可能だった（規約12・23の最も深刻な実例）
grant select, insert, update, delete on progress_tasks to authenticated;
create policy "progress_tasks_select" on progress_tasks for select using (is_project_member(project_id));
create policy "progress_tasks_insert" on progress_tasks for insert with check (is_project_member(project_id));
create policy "progress_tasks_update" on progress_tasks for update using (is_project_member(project_id));
create policy "progress_tasks_delete" on progress_tasks for delete using (is_project_member(project_id));
```

---

## 4.5 補足：画面構成・集計ロジックに関する実装メモ

- **ヘッダーの共通化**：ログイン後の共通ヘッダー（ReqNaviロゴ・ユーザー名・ログアウト）は`src/app/projects/layout.tsx`が担う。`/projects`配下（一覧・詳細・新規作成）全体にネストされる。案件詳細のサイドバー（`src/app/projects/[id]/layout.tsx`）はこの内側に乗る構成で、ロゴの重複表示はしない。`/admin/partners`等、この階層に含まれないページには適用されない点に注意。
- **充足率集計は2種類存在する**：
  - `getReadinessSummary`（`src/actions/readiness.ts`）：単一案件の章別詳細（充足率・曖昧表現件数・要ヒアリング件数）を算出する重めの処理。確定判定ダッシュボード（`/projects/{id}/readiness`）で使用。
  - `listProjectsReadinessSummary`：案件一覧画面で全案件分の概況（確定率程度の軽量な指標）を表示するための軽量版。`requirement_items`のstatusのみを集計し、章別の詳細ロジック（曖昧表現・要ヒアリング判定等）は行わない。
  この2つを混同して片方だけ修正しないよう注意する（例えば充足率の定義を変える場合、両方に影響が無いか確認する）。

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

**`ambiguous_flags`のsource設計（Phase2 Step8で確定）**：`requirement_items.ambiguous_flags`は`source`ごとに独立して入れ替える方式とする。1つの実行（辞書チェック／AI判定／Flow1素案生成）は自分の`source`の要素のみを入れ替え、他`source`の要素は保持する。

| source | 発生元 | 意味 |
|---|---|---|
| `dictionary` | 段階1（辞書チェック） | 特定フィールドに辞書登録済みの曖昧語が含まれる |
| `ai` | 段階2（AI文脈判定） | 特定フィールドの判断基準（数値・条件等）が欠けている |
| `extraction` | Flow1（AI素案生成時） | 資料の記述自体が曖昧だった（項目単位の判定、フィールド不問） |

---

## 6. Phase別開発スコープ（要件定義書 §3 ロードマップと対応）

| Phase | 主な実装対象（本設計書との対応） |
|---|---|
| Phase 0 | organizations / companies / projects / project_members、認証（3節）、RLS基礎（4節） |
| Phase 1 | requirement_items / chapter_column_templates / source_documents、Flow 1（5.1節）、辞書ベース曖昧検出、platform_knowledge_sets（2.6節） |
| Phase 2 | flow_nodes / flow_edges（Step1〜3：テキスト入力・可視化・ドラッグ編集）、As-Is/To-Be差分検出（Step4：新規テーブル無し、flow_nodes読み取り＋requirement_itemsへのai_draft追加のみで実現）、progress_tasks |
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
