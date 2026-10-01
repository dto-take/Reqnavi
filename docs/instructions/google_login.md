指示書：Googleアカウントでのログイン実装

目的

Googleアカウントでのログインを実装する。新規アカウントの扱いは以下の方針とする。

- 自社ドメイン（例：n-sysdes.co.jp）のメールアドレスでGoogleログインした場合、初回ログイン時に自動でuser_profilesを作成する（role: member、company_id: 自社company）
- それ以外のドメインの場合、事前にadminが/admin/usersで作成したアカウント（そのメールアドレスに対応するuser_profiles行）が既に存在する場合のみログインを許可する。存在しない場合はログインを拒否し、管理者への問い合わせを促すメッセージを表示する

前提確認

- 非機能要件画面UX改善（全フェーズ）が完了していること
- 既存のhandle_new_user（Phase0で作成したトリガー、存在すれば）の現在の実装を確認すること。無条件にuser_profilesを作成する形になっている場合、本指示書のドメインチェックと矛盾するため、このトリガーは削除し、判定はアプリケーションコード側で明示的に行う形に変更する

---

Step 1: 環境変数を追加する

OWN_COMPANY_EMAIL_DOMAIN（例：n-sysdes.co.jp）を環境変数として追加する（ローカルの.env.local、Vercelの環境変数の両方に設定が必要になる。設定手順は動作確認前に案内すること）。

Step 2: Supabase側でGoogle OAuthプロバイダを有効化する（ダッシュボード操作の案内）

これはコードでは対応できないダッシュボード操作のため、実装完了後に手順を案内すること。

1. Google Cloud ConsoleでOAuthクライアントを作成し、リダイレクトURIにSupabaseプロジェクトのコールバックURLを設定する
2. Supabaseダッシュボード「Authentication → Providers → Google」で有効化し、Client ID・Secretを設定する

Step 3: ログイン画面にGoogleログインボタンを追加する

src/app/login/page.tsxに、既存のメール/パスワードフォームと併記する形で「Googleでログイン」ボタンを追加する。クリックするとsupabase.auth.signInWithOAuthをprovider: "google"で呼び出し、/auth/callbackへリダイレクトさせる。

Step 4: OAuthコールバックのRoute Handlerを実装する

新規ファイル src/app/auth/callback/route.ts を作成する。以下の流れで実装する。

1. URLのcodeパラメータでexchangeCodeForSessionを呼び、セッションを確立する
2. 認証できたユーザーについて、既にuser_profilesが存在するか確認する
3. 存在しない場合、メールアドレスのドメイン部分を取り出し、環境変数OWN_COMPANY_EMAIL_DOMAINと一致するか確認する
4. 一致する場合のみ、role: member・自社companyのIDでuser_profilesを自動作成する（tenant_id・自社companyの固定UUID等は、既存の初期登録処理（createUserAccount等）が使っている実際の値を確認し、それと矛盾しない値を使うこと）
5. 一致しない場合はサインアウトし、ログイン画面へエラー付きでリダイレクトする

Step 5: エラーメッセージの表示

ログイン画面で、URLのerrorクエリパラメータ（account_not_registered等）に応じたメッセージ（「このメールアドレスでは登録されていません。管理者にアカウント作成を依頼してください。」等）を表示する。

Step 6: 動作確認

1. 自社ドメインのGoogleアカウントで初めてログインし、自動的にuser_profilesが作成され、通常通り利用できることを確認する
2. 同じアカウントで再度ログインし、既存のuser_profilesがそのまま使われる（重複作成されない）ことを確認する
3. 自社ドメイン以外の、事前登録されていないGoogleアカウントでログインを試み、拒否されエラーメッセージが表示されることを確認する
4. 自社ドメイン以外だが、事前に/admin/usersで作成済みのアカウント（同じメールアドレス）でログインし、正常にログインできることを確認する

やってはいけないこと

- 自社ドメイン以外のメールアドレスで、事前登録が無い状態でも自動的にuser_profilesを作成してしまう経路を残さない
- 既存のhandle_new_userトリガー等、無条件にプロフィールを作成する仕組みを残したまま新しいロジックを追加しない（矛盾する二重の作成経路を作らない）

完了条件

- 環境変数の追加・Supabase側のGoogle OAuth設定（ダッシュボード操作の案内込み）
- ログイン画面へのGoogleログインボタン追加
- OAuthコールバックの実装（ドメイン判定込み）
- エラーメッセージの表示実装
- 動作確認済み（自社ドメイン自動登録・未登録拒否・既存アカウントでのログインの3パターン）
