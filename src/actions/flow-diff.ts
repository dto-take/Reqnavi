"use server";

import { safeFormAction, type FormActionState } from "@/lib/action-result";
import { createServerActionClient, getTenantId } from "@/lib/supabase/server";
import { listFlowSteps } from "@/actions/business-flow";
import { diffFlowSteps } from "@/lib/business-flow/diff";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export async function getFlowDiff(projectId: string) {
  const [asisSteps, tobeSteps] = await Promise.all([
    listFlowSteps(projectId, "business_asis"),
    listFlowSteps(projectId, "business_tobe"),
  ]);
  return diffFlowSteps(asisSteps, tobeSteps);
}

type SelectedStep = { id: string; label: string };

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function proposeFunctionalRequirements(projectId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  return safeFormAction("proposeFunctionalRequirements", () => proposeFunctionalRequirementsInner(projectId, formData));
}

async function proposeFunctionalRequirementsInner(projectId: string, formData: FormData): Promise<void> {
  const supabase = await createServerActionClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) throw new UserFacingError("認証が必要です");

  const selectedSteps = formData.getAll("step").map((raw) => JSON.parse(raw as string) as SelectedStep);

  const rows = selectedSteps.map((step) => ({
    project_id: projectId,
    tenant_id: tenantId,
    chapter_no: 9,
    template_type: "C",
    content: {
      category: "",
      name: step.label,
      detail: `業務フローTo-Beの新設ステップ「${step.label}」に基づく提案`,
      item_type: "",
      platform_feature: null,
    },
    status: "ai_draft",
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("requirement_items").insert(rows);
    if (error) throw error;
  }

  revalidatePath(`/projects/${projectId}/business-flow/diff`);
  revalidatePath(`/projects/${projectId}/chapters/9`);
}
