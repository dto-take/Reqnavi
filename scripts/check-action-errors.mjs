// Server Actionのエラー処理の再発防止チェック（docs/action_errors_result.md 段階5）。
//   node scripts/check-action-errors.mjs          … 違反を列挙し、1件でもあれば終了コード1
//   node scripts/check-action-errors.mjs --table  … 全Server Actionの分類表（Markdown）を出力する
//
// 背景：本番ビルドでは、Server Actionがthrowした例外のメッセージが利用者に届かない（規約67）。
// 利用者に理由を見せる失敗は、safeAction／safeFormActionを通して戻り値で返す。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ACTIONS = path.join(root, "src/actions");
const toPosix = (p) => p.split(path.sep).join("/");

// 対象外：ログイン系（失敗はredirectで返す。UserFacingErrorは使わない）
const LOGIN_ACTIONS = new Set(["signInWithPassword", "signInWithGoogle", "updatePassword", "signOut"]);
// 更新・削除の件数確認を求めない内部処理（生成時の置き換え・補助）。理由はdocsの分類表に記載
const COUNT_CHECK_EXEMPT = new Set(["generateKpiDraftInternal", "generateDraftInternal", "regenerateEdges", "updatePassword", "release", "rejectOne", "generateScreenFlowSuggestionsInner"]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(root, "src")).filter((f) => !toPosix(f).includes("/src/actions/"));
const srcText = new Map(srcFiles.map((f) => [toPosix(path.relative(root, f)), fs.readFileSync(f, "utf8")]));
const actionFiles = fs.readdirSync(ACTIONS).filter((f) => f.endsWith(".ts"));
const actionText = new Map(actionFiles.map((f) => [f, fs.readFileSync(path.join(ACTIONS, f), "utf8")]));

// 関数本体（次のトップレベル宣言まで。簡易）
function functions() {
  const rows = [];
  for (const [file, text] of actionText) {
    const parts = text.split(/^export async function /m).slice(1);
    for (const part of parts) {
      const name = part.match(/^(\w+)/)[1];
      const body = part.split(/\n(?:export |async function |function |const |type )/)[0];
      rows.push({ file, name, body });
    }
  }
  return rows;
}

const WRITE = /\.(insert|update|delete|upsert|rpc)\(|storage[\s\S]{0,80}\.(remove|upload)\(/;
const THROWS_FACING = /new UserFacingError|new AiCallError|callGeminiSafely/;

function classify(fn) {
  const { name, body, file } = fn;
  if (LOGIN_ACTIONS.has(name)) return "対象外（ログイン系）";
  if (/safeFormAction\(/.test(body)) return "変換済み（フォーム：FormActionState）";
  if (/safeAction\(/.test(body)) return "変換済み（ActionResult）";
  if (/return \{[^}]*\berror\b[^}]*\}/.test(body) && /catch \(/.test(body)) return "戻り値方式（{error}）";
  if (/^(list|get|fetch|check)/.test(name) || !WRITE.test(body)) return "読み取り系";
  return "書き込み系（未変換）";
}

function usage(name) {
  const where = [];
  for (const [file, t] of srcText) {
    if (new RegExp("\\b" + name + "\\b").test(t) && /from "@\/actions\//.test(t)) where.push(file);
  }
  const internal = [];
  for (const [file, t] of actionText) {
    const own = new RegExp("export async function " + name + "\\b").test(t);
    const count = (t.match(new RegExp("\\b" + name + "\\(", "g")) ?? []).length;
    if ((!own && count > 0) || (own && count > 1 && false)) internal.push(file);
  }
  return { where, internal };
}

const fns = functions().map((f) => {
  const u = usage(f.name);
  let kind = classify(f);
  // クライアントから呼ばれず、他のアクションからだけ呼ばれる書き込み処理は内部用（safeActionの対象外）
  if (kind === "書き込み系（未変換）" && u.where.length === 0 && u.internal.length > 0) kind = "内部用（他のアクションから呼ぶ書き込み処理）";
  return { ...f, kind, ...u };
});

if (process.argv.includes("--table")) {
  const order = ["変換済み（ActionResult）", "変換済み（フォーム：FormActionState）", "戻り値方式（{error}）", "読み取り系", "対象外（ログイン系）", "内部用（他のアクションから呼ぶ書き込み処理）", "書き込み系（未変換）"];
  console.log("# Server Actionの分類表\n");
  console.log("`node scripts/check-action-errors.mjs --table`で生成（docs/action_errors_result.md 段階5）。\n");
  for (const k of order) {
    const list = fns.filter((f) => f.kind === k);
    if (list.length === 0) continue;
    console.log(`## ${k}（${list.length}件）\n`);
    console.log("| アクション | ファイル | 使用箇所 |\n|---|---|---|");
    for (const f of list) {
      const used = f.where.length ? f.where.map((w) => w.replace(/^src\//, "")).join("<br>") : f.internal.length ? `内部のみ（${f.internal.join("・")}）` : "**未使用**";
      console.log(`| ${f.name} | ${f.file} | ${used} |`);
    }
    console.log("");
  }
  const unused = fns.filter((f) => f.where.length === 0 && f.internal.length === 0);
  console.log(`## 未使用のexport（${unused.length}件）\n`);
  console.log(unused.length ? unused.map((f) => `- ${f.file}#${f.name}（${f.kind}）`).join("\n") : "なし");
  process.exit(0);
}

let violations = 0;
const report = (title, lines) => {
  console.log(`\n■ ${title}（${lines.length}件）`);
  for (const l of lines) console.log("  - " + l);
  violations += lines.length;
};

// 1. UserFacingError／AiCallErrorを投げる書き込み系が、safeAction／safeFormActionを通っていない
report(
  "safeAction／safeFormActionを通っていない書き込み系（UserFacingError/AiCallErrorをthrow）",
  fns.filter((f) => f.kind === "書き込み系（未変換）" && THROWS_FACING.test(f.body)).map((f) => `${f.file}#${f.name}`)
);

// 2. ActionResultを返すアクションの結果を使っていない呼び出し（await action(); だけ）
const resultActions = new Set();
for (const [, text] of actionText) for (const m of text.matchAll(/safeAction\("(\w+)"/g)) resultActions.add(m[1]);
const ignored = [];
for (const [file, text] of srcText) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const name of resultActions) {
      if (new RegExp("^\\s*(await|void)\\s+" + name + "\\(").test(line)) ignored.push(`${file}:${i + 1} ${line.trim().slice(0, 100)}`);
    }
  });
}
report("ActionResultの戻り値を使っていない呼び出し（ok／errorを見ていない）", ignored);

// 3. 更新・削除に件数の確認（.select()）が無い（規約47）。内部の補助処理は除外
const noCount = [];
for (const [file, text] of actionText) {
  const re = /\.from\("([a-z_]+)"\)([\s\S]*?);/g;
  let m;
  while ((m = re.exec(text))) {
    if (!/\.(update|delete)\(/.test(m[2]) || /\.select\(/.test(m[2])) continue;
    const before = text.slice(0, m.index);
    const fn = [...before.matchAll(/(?:export )?async function (\w+)/g)].pop()?.[1] ?? "?";
    if (COUNT_CHECK_EXEMPT.has(fn)) continue;
    noCount.push(`${file}:${before.split("\n").length} ${fn}（${m[1]}）`);
  }
}
report("更新・削除の件数確認（.select()）が無い処理", noCount);

console.log(violations === 0 ? "\nOK：違反はありません" : `\nNG：${violations}件の違反があります`);
process.exit(violations === 0 ? 0 : 1);
