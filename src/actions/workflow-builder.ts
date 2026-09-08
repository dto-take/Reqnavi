"use server";

import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { errorMessage } from "@/lib/error-message";
import { NODE_META } from "@/lib/workflow-builder-shared";
import { revalidatePath } from "next/cache";

// 業務フロービルダー（条件分岐対応、flow_type='business_builder'）専用のServer Action群。
// 既存のsrc/actions/business-flow.ts（order_indexのみに基づく単純な直線チェーン＋
// regenerateEdges()前提）とはデータモデルが異なる（ツリー構造）ため、意図的に別ファイルに分離している。

export type ConditionRule = { field: string; op: string; value: string };

export type WorkflowNodeRow = {
  id: string;
  node_type: string;
  label: string;
  role_lane: string;
  mode: string | null;
  system_used: string | null;
  screen_id: string | null;
  sys_kind: string | null;
  input_data: string | null;
  output_data: string | null;
  business_rule: string | null;
  channel: string | null;
  condition_logic: "all" | "any" | null;
  condition_rules: ConditionRule[];
  branch: "main" | "yes" | "no";
  parent_condition_id: string | null;
  order_index: number;
};

const NODE_COLUMNS =
  "id, node_type, label, role_lane, mode, system_used, screen_id, sys_kind, input_data, output_data, business_rule, channel, condition_logic, condition_rules, branch, parent_condition_id, order_index";

type MinimalNode = { id: string; node_type: string; branch: "main" | "yes" | "no"; parent_condition_id: string | null; order_index: number };

export async function listWorkflowNodes(projectId: string): Promise<WorkflowNodeRow[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("flow_nodes")
    .select(NODE_COLUMNS)
    .eq("project_id", projectId)
    .eq("flow_type", "business_builder")
    .order("order_index");
  if (error) throw new Error(errorMessage(error));
  return (data as unknown as WorkflowNodeRow[]) ?? [];
}

// NodeEditPanelのonBlur/デバウンスから、onClick的にstartTransition経由で呼ばれる
// （<form action>を介さない）ため、規約44に従いthrowではなく戻り値のerrorで失敗を返す。
export async function updateFlowNode(
  nodeId: string,
  projectId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    const tenantId = await getTenantId(supabase);
    if (!tenantId) throw new UserFacingError("認証が必要です");

    const { error } = await supabase.from("flow_nodes").update(patch).eq("id", nodeId);
    if (error) throw error;

    revalidatePath(`/projects/${projectId}/business-flow/builder`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// stub:<conditionId>:<yes|no> 形式（src/lib/workflow-layout.tsのstubId()と同じ形式）を
// 検出するための正規表現。空ブランチのスタブをクリックした場合の挿入先指定に使う。
const STUB_ID_RE = /^stub:([0-9a-f-]{36}):(yes|no)$/;

async function fetchMinimalNode(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  nodeId: string
): Promise<MinimalNode | null> {
  const { data } = await supabase
    .from("flow_nodes")
    .select("id, node_type, branch, parent_condition_id, order_index")
    .eq("id", nodeId)
    .single();
  return (data as MinimalNode | null) ?? null;
}

type TailRow = { id: string; node_type: string; order_index: number };

// (parentId, branch)で示されるchainの末尾（order_index最大）の1行を取得する。
async function fetchTailRow(
  supabase: Awaited<ReturnType<typeof createServerActionClient>>,
  parentId: string | null,
  branch: string
): Promise<TailRow | undefined> {
  const tailQuery = supabase
    .from("flow_nodes")
    .select("id, node_type, order_index")
    .eq("branch", branch)
    .order("order_index", { ascending: false })
    .limit(1);
  const result = parentId === null ? await tailQuery.is("parent_condition_id", null) : await tailQuery.eq("parent_condition_id", parentId);
  const rows = (result.data as TailRow[] | null) ?? [];
  return rows[0];
}

// デザインハンドオフ（design_handoff_workflow_builder/README.md「工程の追加（挿入位置ルール）」・
// workflow-requirements-builder.dc.htmlのadd()関数）の挙動を、flow_nodesのフラットな
// (parent_condition_id, branch, order_index)表現に対して再現したもの。優先順位：
//   1. afterNodeIdが"stub:<conditionId>:<yes|no>"形式（空ブランチのスタブ選択中）
//      → その分岐の末尾に追加
//   2. afterNodeIdが実ノードのid（選択中）→ そのノードの直後に追加。
//      ただし選択ノードが条件分岐なら、そのYesルートの先頭に追加
//   3. afterNodeIdがnull（未選択）→ 本線の末尾（末尾が条件分岐ならそのYesルートを
//      再帰的に辿った末尾）に追加
// 不変条件（ハンドオフのinsertAt関数と同じ）：挿入するノード自身がcondition型の場合、
// 挿入位置より後ろに既に続いていた同chainの要素は、新しい条件分岐のYesルートへ丸ごと
// 移送する（条件分岐は所属chainの終端であることを保証するため）。
export async function insertWorkflowNodeAfter(
  projectId: string,
  tenantId: string,
  afterNodeId: string | null,
  nodeType: string
): Promise<{ id: string | null; error: string | null }> {
  try {
    const supabase = await createServerActionClient();
    if (!tenantId) throw new UserFacingError("認証が必要です");

    const auto = nodeType === "action" || nodeType === "notify" || nodeType === "condition";
    const baseInsert: Record<string, unknown> = {
      project_id: projectId,
      tenant_id: tenantId,
      flow_type: "business_builder",
      node_type: nodeType,
      label: NODE_META[nodeType]?.label ?? "新しい工程",
      role_lane: auto ? "システム" : "担当者",
      mode: auto ? "自動" : "手動",
    };
    if (nodeType === "condition") Object.assign(baseInsert, { condition_logic: "all", condition_rules: [] });
    if (nodeType === "notify") Object.assign(baseInsert, { channel: "メール" });

    // ケース1：空ブランチのスタブが挿入先 → その分岐の末尾に追加するだけでよい
    const stubMatch = afterNodeId?.match(STUB_ID_RE);
    if (stubMatch) {
      const [, conditionId, branch] = stubMatch;
      const { data: existing } = await supabase
        .from("flow_nodes")
        .select("order_index")
        .eq("parent_condition_id", conditionId)
        .eq("branch", branch)
        .order("order_index", { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;
      const { data, error } = await supabase
        .from("flow_nodes")
        .insert({ ...baseInsert, parent_condition_id: conditionId, branch, order_index: nextOrder })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("工程の追加に失敗しました");
      revalidatePath(`/projects/${projectId}/business-flow/builder`);
      return { id: data.id, error: null };
    }

    // ケース2：実ノードが選択中 → その直後に挿入
    if (afterNodeId) {
      const after = await fetchMinimalNode(supabase, afterNodeId);
      if (!after) throw new UserFacingError("挿入先の工程が見つかりません");

      if (after.node_type === "condition") {
        // 選択ノードが条件分岐 → Yesルートの先頭に追加。既存のYes子要素をorder_index+1ずつ繰り下げる
        const { data: yesChildren } = await supabase
          .from("flow_nodes")
          .select("id, order_index")
          .eq("parent_condition_id", after.id)
          .eq("branch", "yes")
          .order("order_index", { ascending: false });
        for (const child of yesChildren ?? []) {
          await supabase.from("flow_nodes").update({ order_index: child.order_index + 1 }).eq("id", child.id);
        }
        const { data, error } = await supabase
          .from("flow_nodes")
          .insert({ ...baseInsert, parent_condition_id: after.id, branch: "yes", order_index: 0 })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("工程の追加に失敗しました");
        revalidatePath(`/projects/${projectId}/business-flow/builder`);
        return { id: data.id, error: null };
      }

      // 通常ノードの直後に割り込ませる。挿入するノード自身が条件分岐の場合は不変条件を守るため、
      // 直後に続いていた既存ノード群を新しい条件分岐のYesルートへ丸ごと移送する
      const siblingsQuery = supabase
        .from("flow_nodes")
        .select("id, order_index")
        .eq("branch", after.branch)
        .gt("order_index", after.order_index);
      const { data: siblingsAfter } =
        after.parent_condition_id === null
          ? await siblingsQuery.is("parent_condition_id", null)
          : await siblingsQuery.eq("parent_condition_id", after.parent_condition_id);

      const { data: inserted, error: insertError } = await supabase
        .from("flow_nodes")
        .insert({ ...baseInsert, parent_condition_id: after.parent_condition_id, branch: after.branch, order_index: after.order_index + 1 })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError ?? new Error("工程の追加に失敗しました");

      if (nodeType === "condition") {
        for (let i = 0; i < (siblingsAfter ?? []).length; i++) {
          const s = siblingsAfter![i];
          await supabase.from("flow_nodes").update({ parent_condition_id: inserted.id, branch: "yes", order_index: i }).eq("id", s.id);
        }
      } else {
        for (const s of siblingsAfter ?? []) {
          await supabase.from("flow_nodes").update({ order_index: s.order_index + 1 }).eq("id", s.id);
        }
      }

      revalidatePath(`/projects/${projectId}/business-flow/builder`);
      return { id: inserted.id, error: null };
    }

    // ケース3：未選択 → 本線の末尾（末尾が条件分岐ならそのYesルートを再帰的に辿った末尾）に追加
    let parentId: string | null = null;
    let branch: "main" | "yes" | "no" = "main";
    for (;;) {
      const last = await fetchTailRow(supabase, parentId, branch);
      if (!last || last.node_type !== "condition") {
        const nextOrder = (last?.order_index ?? -1) + 1;
        const { data, error } = await supabase
          .from("flow_nodes")
          .insert({ ...baseInsert, parent_condition_id: parentId, branch, order_index: nextOrder })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("工程の追加に失敗しました");
        revalidatePath(`/projects/${projectId}/business-flow/builder`);
        return { id: data.id, error: null };
      }
      parentId = last.id;
      branch = "yes";
    }
  } catch (e) {
    return { id: null, error: errorMessage(e) };
  }
}

// 通常ノード（条件分岐ではない）の削除。条件分岐ノードは配下のYes/Noを個別に扱う必要があるため
// deleteConditionNode()を使う（誤用防止のためここでガードする）。
export async function deleteWorkflowNode(nodeId: string, projectId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();

    const { data: nodeData } = await supabase.from("flow_nodes").select("node_type").eq("id", nodeId).single();
    if (nodeData?.node_type === "condition") {
      throw new UserFacingError("条件分岐ノードの削除にはdeleteConditionNodeを使ってください");
    }

    const { error } = await supabase.from("flow_nodes").delete().eq("id", nodeId);
    if (error) throw error;

    revalidatePath(`/projects/${projectId}/business-flow/builder`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

// 条件分岐ノードの削除（design_handoff_workflow_builder/README.md「工程の削除」・
// .dc.htmlのremove()関数と同じ挙動）：Yesルート配下は同じ位置に展開して元のchainへ戻し、
// Noルート配下は条件分岐本体と共に削除する（parent_condition_idのon delete cascadeに任せる）。
export async function deleteConditionNode(nodeId: string, projectId: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createServerActionClient();

    const { data: nodeData, error: fetchError } = await supabase
      .from("flow_nodes")
      .select("id, node_type, branch, parent_condition_id, order_index")
      .eq("id", nodeId)
      .single();
    if (fetchError || !nodeData) throw fetchError ?? new UserFacingError("対象の工程が見つかりません");
    if (nodeData.node_type !== "condition") throw new UserFacingError("この関数は条件分岐ノードの削除専用です");

    const { data: yesChildren } = await supabase
      .from("flow_nodes")
      .select("id, order_index")
      .eq("parent_condition_id", nodeId)
      .eq("branch", "yes")
      .order("order_index", { ascending: true });
    const yes = yesChildren ?? [];

    // 削除対象より後ろの兄弟ノードを、Yes配下(yes.length件)で置き換わる分だけ繰り下げ/繰り上げる
    const siblingsQuery = supabase
      .from("flow_nodes")
      .select("id, order_index")
      .eq("branch", nodeData.branch)
      .gt("order_index", nodeData.order_index);
    const { data: siblingsAfterData } =
      nodeData.parent_condition_id === null
        ? await siblingsQuery.is("parent_condition_id", null)
        : await siblingsQuery.eq("parent_condition_id", nodeData.parent_condition_id);
    const siblingsAfter = siblingsAfterData ?? [];

    const shift = yes.length - 1; // 1件（条件分岐自身）がyes.length件に置き換わる差分
    if (shift !== 0) {
      for (const s of siblingsAfter) {
        await supabase.from("flow_nodes").update({ order_index: s.order_index + shift }).eq("id", s.id);
      }
    }

    // Yes配下を、条件分岐が居た位置から順番に親のchainへ展開する
    for (let i = 0; i < yes.length; i++) {
      await supabase
        .from("flow_nodes")
        .update({ parent_condition_id: nodeData.parent_condition_id, branch: nodeData.branch, order_index: nodeData.order_index + i })
        .eq("id", yes[i].id);
    }

    // 条件分岐本体を削除。Noルート配下はparent_condition_idのon delete cascadeでまとめて削除される
    // （Yes配下は上で既に親のchainへ退避済みのため、このcascadeの影響を受けない）
    const { error: deleteError } = await supabase.from("flow_nodes").delete().eq("id", nodeId);
    if (deleteError) throw deleteError;

    revalidatePath(`/projects/${projectId}/business-flow/builder`);
    return { error: null };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
