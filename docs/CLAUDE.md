# CLAUDE.md

このファイルは、本リポジトリでコード開発を行うAIアシスタント（Claude Code等）向けのプロジェクトガイドです。作業前に必ず `docs/01_requirements.md` と `docs/02_architecture.md` を参照してください。

## プロジェクト概要

**ReqNavi** — AI活用型・要件定義支援サービス（社内向け）。

SIerの要件定義工程を、資料からのAI素案生成 → SEによるリファインメント → 確定判定ゲート、という流れで支援し、要件定義工数の40%削減と、確定後の仕様ブレ防止を目的とする。**顧客は本システムを直接操作しない。操作者は常に自社SE・PM・（Phase1より）外注SEに限定される。**

現在のフェーズ：**Phase 1（MVP）**。対象範囲は `docs/01_requirements.md` §6 を参照。

## 技術スタック

- Next.js 15 (App Router) / Vercel
- Supabase（PostgreSQL + RLS / Auth / Storage / Realtime / Edge Functions）
- AI API（**Gemini（`@google/genai`公式SDK、`GEMINI_API_KEY`環境変数）に正式決定。Claude APIは不採用**。Edge Functions・Server Actions経由のみで呼び出す。APIキーをクライアントに露出させない）
- 社内の別プロジェクト（PM Vision）と同一スタックを採用。認証設計もPM Vision準拠

## 絶対に守るべき規約

規約番号は既存の指示書・設計書からの参照を維持するため変更していない。カテゴリ内は番号順。

### 認証・権限

1. **JWTクレーム名は `user_role`。`role` は使わない**（Supabaseの予約語と衝突するため）。
2. **`organizations`（顧客企業）と `companies`（自社/パートナー会社）を混同しない。** 前者は案件の発注元、後者はユーザーの所属先。
6. **パートナー（`user_role = 'partner'`）には、コスト関連項目（`change_requests.estimation_impact` 等）と組織横断機能（Phase4）を絶対に見せない。**
10. **`custom_access_token_hook`はPostgres関数方式で実装する（Edge Function方式は採用しない）。** `supabase/config.toml`の`uri`は`pg-functions://postgres/public/custom_access_token_hook`形式。
18. **`tenant_id`の取得には、必ず`src/lib/supabase/server.ts`の`getTenantId(supabase)`ヘルパーを使う。** `(session as any)?.access_token_claims?.tenant_id`や`session.user.app_metadata?.tenant_id`のような、SDKバージョン依存で壊れやすい経路を新しく書かない（Phase0 Step3・Phase1 Step7で実際に問題化し、都度修正されている）。
    - シグネチャ：`getTenantId(supabase: SupabaseClient) => Promise<string | null>`。内部で`auth.getClaims()`によりJWTを検証し、`custom_access_token_hook`が埋め込んだクレームを取り出す。
    - 未ログイン、または`tenant_id`クレームが無い場合は`null`を返す（例外は投げない）。呼び出し側で`if (!tenantId) redirect("/login")`等のガードを行うか、フォールバック値を判断するのは呼び出し元の責務。
    - クライアントコンポーネントに`tenant_id`を渡す場合は、Server Component側で`getTenantId()`を呼んだ結果をpropとして渡す（規約18と合わせて適用）。

### RLS・DB設計

5. **全テーブルに `project_id`（および `tenant_id`）を持たせ、RLSを同一マイグレーション内で有効化する。**
11. **RLSポリシーが自テーブルを自己参照する場合（例：`project_members`が自分自身を参照して判定する等）は、無限再帰（`42P17`）を避けるため`security definer`のヘルパー関数を作成して使う。** 直接のサブクエリで自己参照しない。
12. **新規テーブルを作成するマイグレーションには、`enable row level security`とポリシーに加えて`grant`文を必ず含める。** 本プロジェクトはSupabase Studio経由ではなくCLIマイグレーションのみでテーブルを作成しているため、Studioが自動で行う`anon`/`authenticated`/`service_role`への基本GRANTが付与されない。RLSだけでは不十分（GRANT自体が無いとRLS以前の段階で全操作が拒否される）。**`service_role`もGRANTが無ければ操作できない点に注意（service_roleはRLSをバイパスするが、GRANTは別レイヤーであり免除されない）。この問題は複数回（Phase0 Step3、Phase1 Step1、認証・メンバー管理の作り忘れ解消）再発しているため、新しいテーブルを1つでも作るマイグレーションでは、必ず以下をセットで含めること（チェックリスト化）：**
    - [ ] `create table`
    - [ ] `alter table ... enable row level security`
    - [ ] `create policy`（最低1つ）
    - [ ] `grant select, insert, update, delete on <table> to authenticated`
    - [ ] `service_role`経由でも操作する予定がある場合、`service_role`へのGRANTも忘れない
    このセットを1つでも欠くと、そのテーブルは動作確認時に必ず`42501`エラーで止まる。
13. **「作成した本人がその行を自分の権限で読み返す」実装（`.insert().select().single()`等）は要注意。** 作成直後、関連する紐付けレコード（例：`project_members`）がまだ無い場合、SELECTポリシーを満たせずINSERT自体が失敗することがある（RETURNINGはSELECT権限を要求するため）。この場合はid をクライアント側で採番する、または`.select()`を使わない実装にする。
14. **PostgRESTの埋め込みJOIN（`select("...profile(...)")`等）を使う場合、対象テーブル間に直接の外部キーが必要。** 2つのテーブルが同じ親テーブルに個別にFKを張っているだけでは、PostgRESTはその2テーブル間の関係を解決できない。
16. **RLSポリシーは「存在すればよい」ではなく、アプリが実際に行う全操作（select/insert/update/delete）を網羅しているか個別に確認する。** SELECTポリシーがあるからといってINSERT/UPDATEが動くとは限らない（Postgresのポリシーはコマンドごとに独立しており、暗黙の継承は無い）。新しい画面でテーブルへの書き込み・更新・削除を行う場合、そのテーブルの既存ポリシーが対応コマンドをカバーしているか`docs/02_architecture.md` 4章で必ず確認し、無ければ同じ可視条件で追加する。
20. **`jsonb`型の配列列（例：`classified_tags`）に対して`@supabase/postgrest-js`の`.contains()`を使う場合、値はJS配列そのものではなく`JSON.stringify([...])`で文字列化して渡す。** 配列を直接渡すと、ライブラリがPostgresネイティブ配列型向けの構文（`cs.{値}`）を使ってしまい、jsonb列に対しては`22P02: invalid input syntax for type json`で必ず失敗する。`content`列など他のjsonb列を`.contains()`で検索する場合も同様に注意する。
21. **テーブルが`project_id`列を直接持たない場合（例：`item_sources`）、RLSポリシーは親テーブル（`requirement_items`等）経由で`is_project_member()`を参照する形で書く。** 「project_idが無いから案件単位の制御ができない」と誤解し、権限チェックを省略しない。
23. **指示書が`create table`を含む場合でも、実行前に対象テーブルが既に存在しないか確認する。** 指示書は「今の実際のDB状態」を完全に把握して書かれているとは限らない（別Stepや過去の作業で先行して作られている場合がある）。存在する場合は、指示書の意図（RLS・GRANT・シード等）だけを既存テーブルに適用する形に読み替える。
    - **`create table if not exists`は、テーブルが既に存在する場合、その定義本体（列のCHECK制約、外部キーの`on delete cascade`挙動等）を一切適用しない（文全体がまるごとスキップされるため）。** 既存テーブルに対しては、不足している列を`add column if not exists`で追加するだけでなく、CHECK制約・外部キーのON DELETE挙動などの制約も個別に確認し、必要なら`drop constraint` + `add constraint`で付け直す。「テーブルが存在した＝定義が完全に揃っている」とは限らない。
24. **新しい参照列（外部キー）を追加し、かつ「当面はこの値で全件固定してよい」という自然なデフォルト値がある場合（例：`platform_knowledge_set_id`のSalesforce固定）、既存行への一括UPDATE（バックフィル）だけでなく、列自体に`default`を設定する。** バックフィルのみだと、マイグレーション後に作られる新規行がNULLのまま漏れる。
29. **1つのテーブルが複数の外部キー列を持つ場合（例：`flow_edges`の`from_node`/`to_node`）、RLSポリシーは関係する列すべてについて所属チェックを行う。** 片方の列のみをチェックすると、もう片方に他案件のIDを指定することで越境した関連付け（他案件のデータへのリンク）が作成できてしまう。アプリ層での事前チェックは有効な保険だが、RLS側の検証が本来の防衛線であり、アプリ層のチェックだけに頼らない。

### AI呼び出し

3. **AI呼び出しは必ず Edge Functions / Server Actions 経由。** フロントエンドから直接AI APIを呼ばない。
4. **AIの出力は必ず `status = 'ai_draft'` 等の未確定ステータスで保存する。** 確定済み（`confirmed`）項目をAIが無断で上書きしてはならない（Flow2は提案のみ、`ai_reconciliation_suggestions` 経由）。
7. **依存関係に基づく自動発火（DB Webhook・cron監視）は実装しない。** 整合性チェック・差分最適化は**すべてボタン起点**のユーザー操作で実行する。
8. **AI抽出結果は必ずZodスキーマでバリデーションしてから保存する。** プロンプトは `prompts` テーブルでバージョン管理し、`ai_interactions` に `prompt_id` を記録する。
9. **プラットフォーム知識（Salesforce標準機能マッピング等）はコードに直書きせず、`platform_knowledge_sets` / `platform_feature_mappings` テーブルに分離する。** Phase1はSalesforce特化で実装するが、将来の他プラットフォーム対応を見込み、ハードコードは避ける。

### Next.js / フロントエンド実装

15. **`any`型は使用しない（`@typescript-eslint/no-explicit-any`がerror設定）。** 指示書のコード例に`any`が含まれる場合は、適切な型に置き換えること。
17. **`"use server"`を先頭に持つファイルは、非同期関数以外をexportできない。** 定数（列の並び順の配列等）や型は、`"use server"`を付けない通常モジュール（例：`src/lib/`配下）に切り出し、Server Actionファイル・クライアントコンポーネントの両方からimportする。
19. **Next.js App Routerでは、同階層に静的ルート（例：`chapters/4`）と動的ルート（例：`chapters/[chapterNo]`）が併存する場合、静的ルートが優先してマッチする。** 意図的に固定ページを用意している章番号は、動的ルート側のコード内にその旨のコメントを残し、対応表（`CHAPTER_TEMPLATE_MAP`等）から除外する。
26. **Route HandlerでBuffer（Node.js）をそのまま`Response`に渡さない。** この環境のNode/TypeScript版では`Buffer<ArrayBufferLike>`が`BodyInit`と構造的に合わないことがある。`new Uint8Array(buffer)`に変換して渡す。
27. **HTTPヘッダの値はByteString（Latin-1）必須であり、日本語等の非ASCII文字を含む値（`Content-Disposition`のファイル名等）を`encodeURIComponent`のみで済ませて直接埋め込むと、実行時に`Cannot convert argument to a ByteString`で必ず落ちる。** ファイル名に日本語を含める場合は、RFC 5987形式（`filename*=UTF-8''<percent-encoded>`）を使い、ASCIIのみの`filename="..."`をフォールバックとして併記する。
30. **Server Component内で`supabase.auth.getUser()`等、トークンリフレッシュを伴う可能性のあるSupabase Authメソッドを呼ぶと、Cookieの書き込み（`setAll`）が発生し得るが、Next.jsはServer Component内でのCookie書き込みを許可していない。** `middleware.ts`によるセッション更新の仕組みが無い場合、認証済みユーザーが該当ページにアクセスした瞬間に`"Cookies can only be modified in a Server Action or Route Handler"`で必ずクラッシュする。`src/lib/supabase/server.ts`の`createServerActionClient()`内、Cookieの`setAll`をtry/catchで囲み、Server Component由来の失敗は無視する（Supabase公式のNext.js App Router向けSSR実装の標準的な対処）。**この対処は共通ヘルパー側で一度行えば、それを使う全箇所に適用される。** 個別のServer Component側で対処しない。
31. **「あるテーブルへのINSERTには、対象案件のメンバーであることを要求する」RLSポリシーは、その案件の最初のメンバー（案件作成者自身）を登録する場面で自己矛盾を起こす（まだメンバーでないため、メンバー登録自体が拒否される）。** この種のブートストラップ問題は、該当箇所のみ`service_role`クライアント（`src/lib/supabase/admin.ts`）経由の書き込みに限定して回避する。対象は関数内でサーバー側が確定させた値（外部からの入力をそのまま使わない）に限る。
32. **ユーザーが自分自身の特定の列だけを更新できるようにする場合（例：`force_password_reset`の解除）、テーブル全体への更新権限を与えるのではなく、列単位のGRANT（`grant update (force_password_reset) on user_profiles to authenticated`）＋「自分の行のみ」のRLSポリシーを組み合わせる。** この経路から`user_role`等の権限昇格ができないことを実装後に確認する。
33. **`confirmed`/`exception_approved`等の「確定済み」ステータスによってcontentの編集を禁止する場合、そのテーブルの行を更新しうる全ての操作経路（通常の入力欄だけでなく、個別ボタン起点のAI提案・自動補完等）に同じステータスガードを適用する。** 1つの経路だけをガードし、別の経路（例：機能要件のSalesforce機能提案ボタン）を見落とすと、確定済み項目が別ルートから静かに上書きされる。新しい書き込み経路を追加する際は、対象テーブルの既存のステータスガード条件を確認し、同じ条件を必ず引き継ぐ。
34. **RLSは行（row）単位の可視性制御であり、列（column）単位のマスキングはできない。** 「特定の列に値が入っている場合、その行全体を特定ロールから隠す」という条件（例：`col is null or role != 'partner'`）を書くと、値が入っている行はreason等の無関係な列まで含めて丸ごと非表示になる（パートナーが変更申請の存在自体を認識できなくなる等）。**特定の列だけを特定ロールに見せたくない場合は、SELECTポリシー自体は通常の行可視性（案件メンバーであること等）のみにし、列のマスキングはアプリケーション層（Server Action内でロールに応じてフィールドをnull化する等）で行う。** どうしてもDB層で対応したい場合はセキュリティビュー（`security_invoker`ビューで対象列を`case when`でnull化する等）を検討する。
35. **Supabase Storageのオブジェクトキー（パス）に、アップロードされた元ファイル名をそのまま含めない。** 日本語等の非ASCII文字を含むファイル名をパスに使うと`StorageApiError: Invalid key`で失敗する。ファイル名はDBの別列（例：`source_documents.file_name`）に保存して表示用に使い、`storage_path`自体はUUID等の安全な文字列のみで構成する（拡張子を残す場合は`.[a-zA-Z0-9]+$`等でASCII文字のみを抽出する）。
36. **章名・カテゴリ名等の「同じ意味の値のリスト」を、複数の場所（AI分類プロンプトのカテゴリ一覧、Flow1のCHAPTER_NAMESマップ、`CHAPTER_TEMPLATE_MAP`等）に別々に書くと、片方だけ更新されて不整合を起こす。** 実際に「開発スコープ」「システム定着化支援要件」が分類プロンプトのカテゴリ一覧に含まれておらず、AI素案生成が該当資料を検索しても永久に見つからない状態になっていた。新しい章・カテゴリを追加する際は、関連する全ての一覧（分類プロンプト、CHAPTER_NAMES、CHAPTER_TEMPLATE_MAP等）を横断的に確認する。可能であれば、章名の正本を`src/lib/chapters.ts`等に一本化し、各箇所はそこからimportする設計に寄せる。**この一元化作業自体も、対象ファイルを手作業で列挙すると漏れる（実例：`readiness/page.tsx`・`export/route.ts`がそれぞれ独自のローカル`CHAPTER_NAMES`/`CHAPTER_TEMPLATE_MAP`を持っており、一元化の指示書が挙げたファイル一覧に含まれていなかった）。重複定義を一元化する指示を受けた場合、指示書に列挙されたファイルだけを信用せず、`grep -rn "CHAPTER_NAMES\|CHAPTER_TEMPLATE_MAP"`等で同名・類似名の定義がコードベース全体に他に無いか自分で確認してから完了とする。**
37. **PostgRESTの埋め込みJOIN（`select("...,other_table(col)")`）で参照先テーブルの列を取得する場合、参照元テーブルのRLSが許可されているだけでは不十分で、参照先テーブル自体にも、その行を返してよいというRLS（SELECTポリシー）が別途必要。** 片方だけでは、参照先の列が常に空欄（null）で返る（エラーにはならないため気づきにくい）。案件横断参照のように、通常のRLSでは見えないはずの行（他案件の`projects`行）を埋め込みJOINで参照する場合は、参照先テーブル専用の可視性ポリシーを明示的に追加する。
38. **デザイントークン（CSS変数）を変更しても、コード内に生のhex値（`#37352F`等）を直接書いている箇所は自動的に追従しない。** 特にSVG（`fill`/`stroke`属性）やロールバッジ・ステータス表示等の配色ロジックは、Tailwindのクラス名ではなく直接hexを書きがちで見落としやすい。配色をトークン化する作業を行う際は、`grep -rn "#[0-9A-Fa-f]\{6\}"`等で生のhex値がコード中に残っていないか確認し、`var(--token名)`（TailwindのCSS変数参照記法）を経由する形に統一する。
39. **【重要・セキュリティ】権限を左右する列（`user_role`等）は、列単位のGRANT＋行単位のRLSの組み合わせだけに権限制御を委ねてはならない。** 実際に発生した脆弱性：`user_profiles`には「本人の行なら更新可」という自己サービス用ポリシー（規約32、`force_password_reset`の自己解除用）が既に存在していた。その後、管理者がロールを変更できるようにするため`grant update (user_role) on user_profiles to authenticated`を追加したところ、**GRANTはロール条件を持てない**ため、この列への書き込み権限が`authenticated`全員に及んだ。RLS側も「本人の行か」しか見ておらず「どの列を変更しようとしているか」は判定しないため、**一般ユーザーが自分自身の`user_role`を`admin`に書き換えられる状態**になっていた（PATCHリクエストで実証済み）。
    - **教訓**：GRANTの列指定（`grant update (col1, col2) on table`）は「どのロールに許可するか」は指定できるが「どの条件で許可するか」は指定できない。RLSの`using`句も「どの行か」は絞れるが「どの列が変更されたか」は区別できない。両者を組み合わせても、片方が緩ければもう片方が意図せず緩んだ状態になる。
    - **正しい対処**：権限に関わる列（ロール・管理者フラグ等）は、RLS/GRANTの組み合わせに加えて、**`before update`トリガーで列そのものをガードする**（例：`NEW.user_role != OLD.user_role`かつ実行者が`admin`でなければ例外を発生させる）。トリガーはポリシーの組み合わせから独立した最終防衛線として機能する。
    - 新しい権限関連の列・機能を追加する際は、既存の「本人のみ更新可」等の広いポリシーが、その列にも意図せず適用されないか必ず確認する。
40. **共通コンポーネントの見た目を、呼び出し側から`className`を追加で渡すだけで上書きしようとしても、確実に反映されるとは限らない。** Tailwindが生成するCSSの適用順序はJSX上の文字列の並び順ではなくスタイルシート生成順で決まるため、コンポーネント内部の既定クラス（例：`bg-page`）と、呼び出し側から渡した`className`（例：`bg-hover`）が競合する場合、後から書いた方が必ず勝つとは限らない。**背景色等、状態によって切り替えたい見た目がある場合は、`className`の後勝ち上書きに頼らず、コンポーネントに`variant`/`tone`のようなpropを用意し、排他的なクラスの組み合わせをコンポーネント内部で完結させる。** どうしても実行時のクラスマージが必要な場合は`tailwind-merge`等のユーティリティの導入を検討する。
41. **色トークンを本来の用途と違う目的に転用する際は、実際に使う背景との輝度差（コントラスト）を確認する。** ステータスバッジ用の`--status-*-bg`（淡い背景色、濃い`-text`色とペアで初めて視認性が成立する設計）を、小さな単色インジケーター（ドット等）にそのまま流用したところ、`--bg-sidebar`との輝度差がほぼ無く実質見えない状態になった（例：背景色235 vs サイドバー248、ほぼ同じ）。小さな単色要素に色トークンを使う場合は、ペアの`-bg`ではなく`-text`側（通常より濃く、コントラストが確保されている）を使うか、実際の配置先の背景と比較して視認できるか確認してから採用する。
42. **行の並び替え（`order_index`の入れ替え）機能を作る場合、画面表示用のクエリと、入れ替えロジック内で「現在の並び」を取得するクエリは、完全に同じ並び順（同一のORDER BY句、同点時のタイブレーカーも含む）を使う。** `order_index`の値が同点（例：全件0のまま）の場合、Postgresは同値の行順を保証しないため、`order by order_index`だけでは表示順と移動ロジックの取得順がずれることがあり、「▲を押したら想定と違う行と入れ替わる」という気づきにくい不具合になる。`order by order_index, created_at`のように、一意な列を第二キーとして必ず加える。
43. **Supabase/PostgRESTが返すエラー（`{code, message, details, hint}`形式）は、JavaScriptの`Error`クラスを継承していない。** `catch (e) { e instanceof Error ? e.message : "汎用エラー文言" }`という判定パターンでは、PostgRESTのDB制約エラー等（例：`23514`のCHECK制約違反）が`instanceof Error`に一致せず、本来表示すべき具体的なエラー内容が汎用文言に潰れてしまう。エラーメッセージをユーザー向けに変換するヘルパーは、`Error`インスタンスと、PostgrestError形の素のオブジェクト（`message`プロパティを持つ）の両方を考慮して実装する（`src/lib/error-message.ts`の`errorMessage()`を共通ヘルパーとして使う）。
    - **さらに重要**：Server Actionから`Error`インスタンスでない値（PostgrestErrorの素のオブジェクト等）をそのまま`throw`すると、Next.jsがServer Action境界を越える際にフィールド値を伏せる（`{code: "23503", details: ..., message: ...}`のように内容が読めなくなる）。**Server Action内でエラーを`throw`する前に、必ず`errorMessage()`でメッセージ文字列を抽出し、`throw new Error(...)`（または`UserFacingError`等の`Error`を継承したクラス）でラップしてから投げる。** 生のPostgrestErrorオブジェクトを直接`throw`しない。
44. **【重要】ReactのError Boundary（Next.jsの`error.tsx`）は、レンダリング中に発生したエラーしか捕捉できない。** `onClick`ハンドラ内や`startTransition`のコールバック内でServer Actionが投げたエラーは、未処理のPromise拒否として扱われ、**`error.tsx`には一切届かない**。実際に`RequirementTable`の削除ボタン（FK制約違反で失敗）で、ユーザーには何も起きなかったように見えるサイレント失敗が発生した。`onClick`＋`startTransition`でServer Actionを呼ぶ実装では、`error.tsx`に頼らず、呼び出し側で明示的に`try/catch`（`startTransition(async () => { try { await action(); } catch (e) { toastの表示等 } })`）を行い、失敗をユーザーに知らせること。`<form action={...}>`経由（Server Actionのエラーがレンダリング時に伝播する）とは挙動が異なる点に注意する。
45. **【重要・リモートDB特有】`supabase db push`実行中にマイグレーションが原因不明で途中停止した場合、それより前のマイグレーションが実際には完全に適用されていないにもかかわらず、マイグレーション履歴（`supabase_migrations.schema_migrations`）には「適用済み」と記録されてしまうことがある。** この状態のまま`db push`を再実行すると、履歴上は完了しているはずの古いマイグレーションはスキップされ、後続のマイグレーション（例：後から作られたテーブルへのRLS設定）が「参照先テーブルが存在しない」という一見無関係なエラーで失敗する。原因調査は「エラーが出た箇所」ではなく「実際のスキーマ状態」を基準に行う（`grep`でテーブル作成元のマイグレーションを特定し、Studio等で該当テーブルが実在するか直接確認する）。**対象DBに保持すべき実データが無い場合に限り、`supabase db reset --linked`でスキーマを作り直し、全マイグレーションを最初から再適用することで解消できる。** 実データが存在する環境（特に本番）ではこの方法は使えないため、個別のマイグレーション履歴を手動で修復する必要がある（本番リリース時は特に注意すること）。
46. **一部のnpmパッケージ（`officeparser`等）は、ファイル先頭での静的`import`がTurbopack（Next.jsのバンドラ）のSSRバンドルで正しく解決されず、実行時に`undefined`になることがある（Node単体のテストでは問題が再現しないため気づきにくい）。** サーバー専用のコード（Server Action、Route Handler内）で外部ライブラリを使う際、静的importで実行時エラー・`undefined`エラーが起きる場合は、関数内での動的import（`const lib = await import("パッケージ名")`）に切り替えることで解決できることが多い。
47. **【重要】SupabaseのUPDATE/DELETE操作は、RLSポリシーによって対象行がフィルタされ実質0件しか更新・削除されなかった場合でも、デフォルトでは`error`を返さず「成功（0件更新）」として扱われる。** 実際に`source_documents`のUPDATEポリシーが無い状態で再分類処理を実行したところ、`{error: null}`が返るにもかかわらず実データは一切更新されていない不具合が発生した。書き込み系操作の実装時は、単に`if (error) throw error`で済ませず、意図した件数が実際に更新されたかを`.select()`で明示的に確認する（またはRLSポリシーの網羅性を規約16に従って事前に確認する）ことで、この種のサイレント失敗を防ぐ。
48. **【重要】あるテーブル（例：`projects`）を起点にカスケード削除等の影響範囲を洗い出す場合、そのテーブルを`references projects(id)`のように直接参照するテーブルの`grep`だけでは不十分。** `project_id`列を持たず、`requirement_items`等の中間テーブル経由でのみ`projects`に連なるテーブル（例：`item_sources`・`item_history`・`baseline_item_snapshots`・`ai_reconciliation_suggestions`）が見落とされる。これらを見落とすと、削除処理の途中でFK違反が起き、処理全体が失敗する。正確に洗い出すには、`grep`ではなく`pg_constraint`を直接クエリして実際の外部キー依存グラフをたどる（`select conname, conrelid::regclass, confrelid::regclass from pg_constraint where contype = 'f'`等）。あわせて、`storage.objects`（Supabase Storage）にもテーブルと同様にDELETE用のRLSポリシーが必要な場合がある（DBの削除が成功してもStorage側のファイルだけが残る不整合を防ぐため）。
49. **複数の資料（ドキュメント）を1回のAI呼び出しにまとめて渡す構造化抽出タスクで、資料間に重複した内容（同じ情報が別々の資料に書かれている）があると、Geminiの抽出結果が不安定になることがある（0件になったり、資料ごとに重複してN倍になったりする）。** 実際に「同じスケジュール情報が2資料に記載されている」状況で、本来4件のところ0件または8件になる現象が発生した。各資料を単独で渡すと安定して正しい件数になることから、原因は複数資料の重複処理にあると特定できた。対処は、(1) `generateContent`の`temperature`を下げる（例：0.1）、(2) プロンプトに「複数資料に同じ内容が重複している場合は1件に統合して抽出すること」という明示的な指示を追加する、の組み合わせが有効。
37. **PostgRESTの埋め込みJOIN（`select("...,other_table(col)")`）は、参照元テーブルのRLSで行が見えても、それだけでは不十分。JOIN先のテーブル自体のRLSでもその行が見える必要がある。** 片方のテーブルだけ許可すると、結合結果のその部分が常に空欄になる（エラーにはならず、単に値が無いだけなので発見しづらい）。新しい埋め込みJOINを設計する際は、関係する全テーブルのSELECTポリシーが、同じ状況で両方満たされるかを確認する。
38. **案件横断・組織横断の可視性を新しく設計する際は、必ずCLAUDE.mdの既存規約（特に規約6：パートナーへのコスト情報・組織横断機能の非表示）を読み返してから実装する。** 新機能の指示書を書く際、規約に反する設計を見落とすことがある（実例：案件横断参照機能の初回設計で、パートナー除外の考慮が指示書から漏れていた）。

### 指示書・検証プロセス

22. **指示書内の「やってはいけないこと」等の制約説明と、サンプルコードの実装内容が矛盾している場合、制約説明を優先し、サンプルコードは参考実装（イラストレーション）として扱う。** 指示書の執筆時点でこの矛盾に気づけていないことがあるため、実装時に矛盾を見つけたら制約に沿う形へ修正してよい（都度確認を求める必要はない）。
25. **`<form action={...}>`を使わずonClick等でServer Actionを直接呼ぶ実装は、curlによるフォーム送信シミュレーションでは検証できない。** この形式の動作確認が必要な場合、同等のロジックを実データに対して直接実行するスタンドアロンスクリプトを用意するなど、別の検証手段を使う。
28. **Server Actionの動作検証は、`<form>`経由・onClick経由を問わず、curlによるリクエストシミュレーションでは信頼できない場合がある。** 本環境ではNext.js側の要因（詳細未特定）により、以前は検証できていたパターンでも`"Connection closed"`で失敗することがある（`redirect()`の有無に関わらず発生）。**curlシミュレーションをデフォルトの検証手段にせず、以下を優先する**：
    - 同等のロジックを実データに対して直接実行するスタンドアロンスクリプト、またはPostgRESTへの直接操作で結果を検証する
    - 認証が絡む画面の表示確認は、テストユーザーのJWTからセッションCookieを構築し、実際のページをGETして検証する
    - 上記で不十分な場合のみ、実ブラウザでの手動確認に切り替える

## ディレクトリ構成（想定）

```
reqnavi/
├── CLAUDE.md
├── docs/
│   ├── 01_requirements.md
│   └── 02_architecture.md
├── src/
│   ├── app/                 # Next.js App Router
│   ├── actions/              # Server Actions
│   ├── components/domain/    # テーブルエディタ・フロー図・ガント等
│   └── lib/ai/                # AI呼び出し・reconcile()
└── supabase/
    ├── migrations/
    └── functions/            # Edge Functions
```

## 環境について（重要）

日常の開発・コーディングでは、以下のいずれかのみを対象とする。**本番（Production）のSupabase/Vercelプロジェクトには、リリース承認プロセスを経ずに絶対に接続・操作しない。**

| 環境 | Supabase | Vercel | 用途 |
|---|---|---|---|
| ローカル | `supabase start`（Docker、都度リセット可） | - | 個人の開発作業 |
| Staging | `reqnavi-staging` | **Production環境として設定**（`main`ブランチ、`reqnavi.vercel.app`） | 結合テスト・実機検証。通常の開発作業はここまで |
| 本番 | `reqnavi-production`（未作成、リリース直前に別途作成） | 未設定 | 本番。承認フローを経てのみ接続 |

**重要な注意（実態とVercel上の表記のずれ）**：VercelのProduction/Preview区分を一本化する運用に変更したため、**Vercel上は「Production」と表示されるデプロイでも、接続先Supabaseは`reqnavi-staging`のまま**である。「Vercelの言うProduction」＝「本サービスの本番環境」ではない点を、開発・運用メンバー全員が混同しないよう常に意識すること。本当の本番リリース時は、`reqnavi-production`という別のSupabaseプロジェクトを新規作成し、承認フローを経て切り替える。

## 既知の未決事項（開発中に確認が必要）

- [TD-001] AI APIベンダーとの「学習未使用」契約条件は法務確認待ち。確認前に機密度の高い案件データを投入しないこと。
- [TD-002] 本サービス自体の運用・保守の恒久的な担当部門が未確定（`docs/01_requirements.md` §13参照）。
- [TD-003] 「同一顧客の他案件参照」（Phase4, `allow_cross_project_reference`）の運用ルール（誰がいつオンにするか）は未確定。
- [TD-004] ～解消済み～ `chapter_column_templates`に`applicable_chapters`列を追加し、列ごとの章別適用範囲を持たせる設計に変更（`listColumnDefs`・`readiness.ts`・Word出力・AI素案生成プロンプト組み立てのすべてで対応済み）。以前の「拡張列を判定対象から除外する簡略化」は撤廃された。

## 開発の進め方

各Phaseの機能は `docs/01_requirements.md` §9（機能要件）の対応Phase列を参照し、該当するものから着手する。実装が要件定義書の内容から逸脱する場合は、`docs/02_architecture.md` の改訂履歴に変更概要を追記すること（PM Visionの `02_アーキテクチャ設計書.md` の運用に倣う）。
