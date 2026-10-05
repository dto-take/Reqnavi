"use server";

import { safeFormAction, type FormActionState } from "@/lib/action-result";
import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function toggleCrossProjectReference(projectId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  return safeFormAction("toggleCrossProjectReference", () => toggleCrossProjectReferenceInner(projectId, formData));
}

async function toggleCrossProjectReferenceInner(projectId: string, formData: FormData): Promise<void> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const enabled = formData.get("enabled") === "true";

  const { error } = await supabase
    .from("projects")
    .update({ allow_cross_project_reference: enabled })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/settings`);
}

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function updateSelectedChapters(projectId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  return safeFormAction("updateSelectedChapters", () => updateSelectedChaptersInner(projectId, formData));
}

async function updateSelectedChaptersInner(projectId: string, formData: FormData): Promise<void> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const selectedChapters = formData.getAll("chapters").map(Number);
  const { error } = await supabase
    .from("projects")
    .update({ selected_chapters: selectedChapters })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath(`/projects/${projectId}`);
}
