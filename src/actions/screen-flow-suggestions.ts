"use server";

import { safeAction, type ActionResult } from "@/lib/action-result";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { getActivePrompt } from "@/lib/ai/prompts";
import { callGeminiSafely } from "@/lib/ai/gemini-error";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage, knownErrorMessage, GENERIC_ERROR_JA } from "@/lib/error-message";
import { nodePosition } from "@/lib/screen-flow/derive";
import { buildFunctionItems } from "@/lib/screen-flow/function-items";
import { createScreenEdgeRow, createScreenNodeRow, type Supabase } from "@/lib/screen-flow/node-ops";
import {
  RawSuggestionSchema,
  normalizeSuggestions,
  placeProposedNodes,
  type EndpointRef,
} from "@/lib/screen-flow/suggestions";
import { listScreenEdges, listScreenNodes } from "@/actions/screen-transition";
import { listRequirementItems } from "@/actions/requirement-items";
import { revalidatePath } from "next/cache";

// screen_flow_ux_phase3.md：画面遷移図のAI差分提案。提案は専用テーブルscreen_flow_suggestionsに
// 保存する（flow_nodes/flow_edgesには混ぜない）。

export type SuggestionEndpoint = { ref: "node" | "suggestion"; id: string; name: string };
export type NodeSuggestion = {
  id: string;
  kind: "node";
  name: string;
  function_item_id: string | null;
  x: number;
  y: number;
  why: string;
};
export type TransitionSuggestion = {
  id: string;
  kind: "transition";
  from: SuggestionEndpoint;
  to: SuggestionEndpoint;
  label: string;
  why: string;
};
export type ScreenSuggestions = { nodes: NodeSuggestion[]; transitions: TransitionSuggestion[] };

type NodePayload = { name: string; function_item_id: string | null; x: number; y: number };
type TransitionPayload = { from: SuggestionEndpoint; to: SuggestionEndpoint; label: string };
type SuggestionRow = {
  id: string;
  kind: "node" | "transition";
  payload: unknown;
  why: string;
  state: "open" | "adopted" | "rejected";
  result_id: string | null;
};

function path(projectId: string) {
  return `/projects/${projectId}/chapters/9/screen-transitions`;
}

async function fetchRows(supabase: Supabase, projectId: string, state?: SuggestionRow["state"]) {
  let q = supabase
    .from("screen_flow_suggestions")
    .select("id, kind, payload, why, state, result_id")
    .eq("project_id", projectId)
    .order("created_at")
    .order("id");
  if (state) q = q.eq("state", state);
  const { data, error } = await q;
  if (error) throw new UserFacingError(errorMessage(error));
  return data as unknown as SuggestionRow[];
}

// 表示用：open の提案を返す。遷移提案の端点は、採用済みの提案ノードなら実ノードへ解決し、
// 実ノードが削除済み・提案ノードが見送り済みで端点が存在しないものは除外する。
export async function listScreenSuggestions(projectId: string): Promise<ScreenSuggestions> {
  const supabase = await createServerActionClient();
  const [rows, nodes] = await Promise.all([fetchRows(supabase, projectId), listScreenNodes(projectId)]);
  const realIds = new Set(nodes.map((n) => n.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const open = rows.filter((r) => r.state === "open");

  const resolveEndpoint = (e: SuggestionEndpoint): SuggestionEndpoint | null => {
    if (e.ref === "node") return realIds.has(e.id) ? e : null;
    const s = byId.get(e.id);
    if (!s) return null;
    if (s.state === "open") return e;
    if (s.state === "adopted" && s.result_id && realIds.has(s.result_id)) return { ref: "node", id: s.result_id, name: e.name };
    return null;
  };

  const result: ScreenSuggestions = { nodes: [], transitions: [] };
  for (const r of open) {
    if (r.kind === "node") {
      const p = r.payload as NodePayload;
      result.nodes.push({ id: r.id, kind: "node", name: p.name, function_item_id: p.function_item_id, x: p.x, y: p.y, why: r.why });
    } else {
      const p = r.payload as TransitionPayload;
      const from = resolveEndpoint(p.from);
      const to = resolveEndpoint(p.to);
      if (!from || !to) continue;
      result.transitions.push({ id: r.id, kind: "transition", from, to, label: p.label, why: r.why });
    }
  }
  return result;
}

const FIELD_LIMIT = 300;
const clip = (s: string) => (s.length > FIELD_LIMIT ? `${s.slice(0, FIELD_LIMIT)}…` : s);

export async function generateScreenFlowSuggestions(projectId: string): Promise<ActionResult<{ nodes: number; transitions: number }>> {
  return safeAction("generateScreenFlowSuggestions", () => generateScreenFlowSuggestionsInner(projectId));
}

async function generateScreenFlowSuggestionsInner(projectId: string): Promise<{ nodes: number; transitions: number }> {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const [nodes, edges, items, rejectedRows] = await Promise.all([
    listScreenNodes(projectId),
    listScreenEdges(projectId),
    listRequirementItems(projectId, 9),
    fetchRows(supabase, projectId, "rejected"),
  ]);
  // F-NNの採番は画面遷移図のページ表示と同じ関数を共有する。rejected（不採用）の項目は対象から除く。
  const allFunctions = buildFunctionItems(items.map((i) => ({ id: i.id, status: i.status, content: i.content })));
  const functions = allFunctions.filter((f) => f.status !== "rejected");
  if (nodes.length === 0 && functions.length === 0) {
    throw new UserFacingError("画面情報を持つ9章の機能要件がありません。先に9章で画面パターン・表示項目を入力してください。");
  }

  const functionById = new Map(allFunctions.map((f) => [f.id, f]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const rejectedNodeNames: string[] = [];
  const rejectedTransitions: { from: string; to: string }[] = [];
  for (const r of rejectedRows) {
    if (r.kind === "node") rejectedNodeNames.push((r.payload as NodePayload).name);
    else {
      const p = r.payload as TransitionPayload;
      rejectedTransitions.push({ from: p.from.name, to: p.to.name });
    }
  }

  const screensText =
    nodes
      .map((n) => {
        const f = n.function_item_id ? functionById.get(n.function_item_id) : undefined;
        return `${n.screen_code ?? "-"}：${n.label}／${f ? f.code : "9章未紐付け"}`;
      })
      .join("\n") || "（まだ画面はありません）";
  const transitionsText =
    edges
      .map((e) => {
        const a = nodeById.get(e.from_node);
        const b = nodeById.get(e.to_node);
        return a && b ? `${a.screen_code ?? "-"} ${a.label} → ${b.screen_code ?? "-"} ${b.label}：${e.label ?? "（操作名なし）"}` : null;
      })
      .filter((l): l is string => l !== null)
      .join("\n") || "（まだ遷移はありません）";
  const functionsText =
    functions
      .map((f) => `${f.code}：${clip(f.name)}／${clip(f.pattern) || "-"}／${clip(f.fields.join(","))}／${clip(f.actions.join(","))}`)
      .join("\n") || "（なし）";
  const rejectedText =
    [
      ...rejectedNodeNames.map((n) => `画面：${n}`),
      ...rejectedTransitions.map((t) => `遷移：${t.from} → ${t.to}`),
    ].join("\n") || "（なし）";

  const { id: promptId, body: promptBody } = await getActivePrompt("suggest_screen_flow_diff");
  const filledPrompt = promptBody
    .replace("{screens}", () => screensText)
    .replace("{transitions}", () => transitionsText)
    .replace("{functions}", () => functionsText)
    .replace("{rejected}", () => rejectedText);

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await callGeminiSafely(() =>
    ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: filledPrompt,
      config: { responseMimeType: "application/json", temperature: 0.2 },
    })
  );

  const cleaned = (response.text ?? "{}").replace(/```json|```/g, "").trim();
  let json: unknown = {};
  try {
    json = JSON.parse(cleaned);
  } catch {
    json = null;
  }
  const parsed = RawSuggestionSchema.safeParse(json);
  const inputSummary = {
    flow_type: "screen_transition",
    node_count: nodes.length,
    edge_count: edges.length,
    function_count: functions.length,
    rejected_count: rejectedRows.length,
  };
  if (!parsed.success) {
    await supabase
      .from("ai_interactions")
      .insert({ project_id: projectId, prompt_id: promptId, input_summary: inputSummary, output: { error: "validation_failed" } });
    throw new UserFacingError("AIの出力形式が不正でした。");
  }

  const normalized = normalizeSuggestions(parsed.data, {
    nodes: nodes.map((n) => ({
      id: n.id,
      code: n.screen_code,
      name: n.label,
      function_item_id: n.function_item_id,
      status: n.status,
    })),
    edges,
    functions: functions.map((f) => ({ id: f.id, code: f.code })),
    rejectedNodeNames,
    rejectedTransitions,
  });
  const placed = placeProposedNodes(
    nodes.map((n, i) => ({ id: n.id, ...nodePosition(n, i) })),
    normalized.nodes,
    normalized.transitions
  );

  await supabase.from("ai_interactions").insert({
    project_id: projectId,
    prompt_id: promptId,
    input_summary: inputSummary,
    output: {
      raw_nodes: parsed.data.nodes.length,
      raw_transitions: parsed.data.transitions.length,
      nodes: normalized.nodes.length,
      transitions: normalized.transitions.length,
      dropped_nodes: parsed.data.nodes.length - normalized.nodes.length,
      dropped_transitions: parsed.data.transitions.length - normalized.transitions.length,
    },
  });

  // 保存の前に、未対応（open）の提案を削除して置き換える。adopted/rejectedは履歴として残す。
  const { error: delError } = await supabase
    .from("screen_flow_suggestions")
    .delete()
    .eq("project_id", projectId)
    .eq("state", "open");
  if (delError) throw new UserFacingError(errorMessage(delError));

  const idByKey = new Map<string, string>();
  for (const n of normalized.nodes) {
    const pos = placed.get(n.key)!;
    const { data, error } = await supabase
      .from("screen_flow_suggestions")
      .insert({
        project_id: projectId,
        tenant_id: tenantId,
        kind: "node",
        payload: { name: n.name, function_item_id: n.function_item_id, x: pos.x, y: pos.y } satisfies NodePayload,
        why: n.why,
      })
      .select("id")
      .single();
    if (error || !data) throw new UserFacingError(error ? errorMessage(error) : "提案の保存に失敗しました");
    idByKey.set(n.key, (data as unknown as { id: string }).id);
  }

  const nameOfNode = (id: string) => nodeById.get(id)?.label ?? "";
  const nameOfKey = (key: string) => normalized.nodes.find((n) => n.key === key)?.name ?? "";
  const toEndpoint = (r: EndpointRef): SuggestionEndpoint =>
    r.ref === "node"
      ? { ref: "node", id: r.id, name: nameOfNode(r.id) }
      : { ref: "suggestion", id: idByKey.get(r.key)!, name: nameOfKey(r.key) };
  const transitionRows = normalized.transitions.map((t) => ({
    project_id: projectId,
    tenant_id: tenantId,
    kind: "transition",
    payload: { from: toEndpoint(t.from), to: toEndpoint(t.to), label: t.label } satisfies TransitionPayload,
    why: t.why,
  }));
  if (transitionRows.length > 0) {
    const { error } = await supabase.from("screen_flow_suggestions").insert(transitionRows);
    if (error) throw new UserFacingError(errorMessage(error));
  }

  revalidatePath(path(projectId));
  return { nodes: normalized.nodes.length, transitions: normalized.transitions.length };
}

// 提案を open → adopted へ原子的に「確保」する（二重採用の防止）。0件なら処理済み。
async function claim(supabase: Supabase, id: string, projectId: string): Promise<SuggestionRow> {
  const { data, error } = await supabase
    .from("screen_flow_suggestions")
    .update({ state: "adopted" })
    .eq("id", id)
    .eq("project_id", projectId)
    .eq("state", "open")
    .select("id, kind, payload, why, state, result_id");
  if (error) throw new UserFacingError(errorMessage(error));
  if (!data || data.length === 0) throw new UserFacingError("提案が見つかりません（既に処理済みの可能性があります）");
  return (data as unknown as SuggestionRow[])[0];
}

async function release(supabase: Supabase, id: string) {
  await supabase.from("screen_flow_suggestions").update({ state: "open", result_id: null }).eq("id", id);
}

async function resolveEndpointId(supabase: Supabase, e: SuggestionEndpoint): Promise<string> {
  if (e.ref === "node") return e.id;
  const { data, error } = await supabase
    .from("screen_flow_suggestions")
    .select("state, result_id")
    .eq("id", e.id)
    .maybeSingle();
  if (error) throw new UserFacingError(errorMessage(error));
  const row = data as unknown as { state: string; result_id: string | null } | null;
  if (!row || row.state !== "adopted" || !row.result_id) throw new UserFacingError("先に画面を採用してください");
  return row.result_id;
}

async function adoptOne(supabase: Supabase, tenantId: string, suggestionId: string, projectId: string) {
  // 端点・ロックの検証で失敗した場合に提案がadoptedのまま残らないよう、
  // 確保→作成→result_id保存の順で行い、失敗時はopenへ戻す。
  const row = await claim(supabase, suggestionId, projectId);
  try {
    let resultId: string;
    if (row.kind === "node") {
      const p = row.payload as NodePayload;
      resultId = await createScreenNodeRow(supabase, projectId, tenantId, {
        name: p.name,
        functionItemId: p.function_item_id,
        status: "ai_draft",
        position: { x: p.x, y: p.y },
      });
    } else {
      const p = row.payload as TransitionPayload;
      const from = await resolveEndpointId(supabase, p.from);
      const to = await resolveEndpointId(supabase, p.to);
      // 確定済みの遷移元の拒否・自己ループ・重複は、手動の遷移追加と同じ検証を通す（規約33）
      resultId = await createScreenEdgeRow(supabase, projectId, from, to, p.label);
    }
    const { data, error } = await supabase
      .from("screen_flow_suggestions")
      .update({ result_id: resultId })
      .eq("id", suggestionId)
      .select("id");
    if (error) throw new UserFacingError(errorMessage(error));
    if (!data || data.length === 0) throw new UserFacingError("提案の更新に失敗しました");
    return { kind: row.kind, resultId };
  } catch (e) {
    await release(supabase, suggestionId);
    throw e;
  }
}

export async function adoptScreenSuggestion(
  suggestionId: string,
  projectId: string
): Promise<ActionResult<{ kind: "node" | "transition"; resultId: string }>> {
  return safeAction("adoptScreenSuggestion", () => adoptScreenSuggestionInner(suggestionId, projectId));
}

async function adoptScreenSuggestionInner(
  suggestionId: string,
  projectId: string
): Promise<{ kind: "node" | "transition"; resultId: string }> {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  const result = await adoptOne(supabase, tenantId, suggestionId, projectId);
  revalidatePath(path(projectId));
  return result;
}

async function rejectOne(supabase: Supabase, suggestionId: string, projectId: string) {
  const { data, error } = await supabase
    .from("screen_flow_suggestions")
    .update({ state: "rejected" })
    .eq("id", suggestionId)
    .eq("project_id", projectId)
    .eq("state", "open")
    .select("id, kind");
  if (error) throw new UserFacingError(errorMessage(error));
  if (!data || data.length === 0) throw new UserFacingError("提案が見つかりません（既に処理済みの可能性があります）");
  if ((data as unknown as { kind: string }[])[0].kind !== "node") return;

  // ノード提案を見送ったら、そのノードを端点とする未対応の遷移提案もあわせて見送る
  const open = await fetchRows(supabase, projectId, "open");
  const related = open
    .filter((r) => r.kind === "transition")
    .filter((r) => {
      const p = r.payload as TransitionPayload;
      return (p.from.ref === "suggestion" && p.from.id === suggestionId) || (p.to.ref === "suggestion" && p.to.id === suggestionId);
    })
    .map((r) => r.id);
  if (related.length > 0) {
    const { error: relError } = await supabase.from("screen_flow_suggestions").update({ state: "rejected" }).in("id", related);
    if (relError) throw new UserFacingError(errorMessage(relError));
  }
}

export async function rejectScreenSuggestion(suggestionId: string, projectId: string): Promise<ActionResult> {
  return safeAction("rejectScreenSuggestion", () => rejectScreenSuggestionInner(suggestionId, projectId));
}

async function rejectScreenSuggestionInner(suggestionId: string, projectId: string): Promise<void> {
  const supabase = await createServerActionClient();
  await rejectOne(supabase, suggestionId, projectId);
  revalidatePath(path(projectId));
}

// 「すべて採用」：ノード提案→遷移提案の順に処理する。個別の失敗では止めず、成功・失敗件数を返す。
// 失敗の理由は、同じ文言の件数をまとめて返す（画面で「〇〇：2件、△△：1件」と集計して表示する）
export type AdoptAllResult = { adopted: number; failed: { reason: string; count: number }[] };

export async function adoptAllScreenSuggestions(projectId: string): Promise<ActionResult<AdoptAllResult>> {
  return safeAction("adoptAllScreenSuggestions", () => adoptAllScreenSuggestionsInner(projectId));
}

async function adoptAllScreenSuggestionsInner(projectId: string): Promise<AdoptAllResult> {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");
  const open = await fetchRows(supabase, projectId, "open");
  // 対象が1件も見えない（既に処理済み、または権限が無くRLSで見えない）場合は、「0件を採用」と成功扱いにしない
  if (open.length === 0) throw new UserFacingError("提案が見つかりません（既に処理済みの可能性があります）");
  const ordered = [...open.filter((r) => r.kind === "node"), ...open.filter((r) => r.kind === "transition")];
  let adopted = 0;
  const failedByReason = new Map<string, number>();
  for (const r of ordered) {
    try {
      await adoptOne(supabase, tenantId, r.id, projectId);
      adopted += 1;
    } catch (e) {
      const reason = e instanceof UserFacingError ? e.message : (knownErrorMessage(e) ?? GENERIC_ERROR_JA);
      if (!(e instanceof UserFacingError)) console.error("[action:adoptAllScreenSuggestions] unexpected error:", e);
      failedByReason.set(reason, (failedByReason.get(reason) ?? 0) + 1);
    }
  }
  revalidatePath(path(projectId));
  return { adopted, failed: [...failedByReason.entries()].map(([reason, count]) => ({ reason, count })) };
}

export async function rejectAllScreenSuggestions(projectId: string): Promise<ActionResult<{ rejected: number }>> {
  return safeAction("rejectAllScreenSuggestions", () => rejectAllScreenSuggestionsInner(projectId));
}

async function rejectAllScreenSuggestionsInner(projectId: string): Promise<{ rejected: number }> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("screen_flow_suggestions")
    .update({ state: "rejected" })
    .eq("project_id", projectId)
    .eq("state", "open")
    .select("id");
  if (error) throw new UserFacingError(errorMessage(error));
  // 規約47：RLSで拒否された更新は error:null・0件になる。0件は「見送れる提案が無かった」として失敗にする
  if (!data || data.length === 0) throw new UserFacingError("提案が見つかりません（既に処理済みの可能性があります）");
  revalidatePath(path(projectId));
  return { rejected: data.length };
}
