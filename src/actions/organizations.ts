"use server";

import { safeAction, safeFormAction, type ActionResult, type FormActionState } from "@/lib/action-result";
import { createServerActionClient } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/user-error";
import { revalidatePath } from "next/cache";

export type OrganizationWithProjectCount = {
  id: string;
  name: string;
  industry: string | null;
  projects: { id: string }[];
};

export async function listOrganizationsWithProjectCount(): Promise<OrganizationWithProjectCount[]> {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, industry, projects(id)")
    .order("name");
  if (error) throw error;
  return data as unknown as OrganizationWithProjectCount[];
}

// useActionStateの形（失敗は戻り値のerrorでフォーム内に表示する。本番ビルドではthrowの文言が消えるため）
export async function createOrganization(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  return safeFormAction("createOrganization", () => createOrganizationInner(formData));
}

async function createOrganizationInner(formData: FormData): Promise<void> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const { error } = await supabase.from("organizations").insert({
    name: formData.get("name") as string,
    industry: formData.get("industry") as string,
  });
  if (error) throw error;
  revalidatePath("/organizations");
}

export async function updateOrganization(orgId: string, formData: FormData): Promise<ActionResult> {
  return safeAction("updateOrganization", () => updateOrganizationInner(orgId, formData));
}

async function updateOrganizationInner(orgId: string, formData: FormData): Promise<void> {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const { data: affected1, error } = await supabase
    .from("organizations")
    .update({ name: formData.get("name") as string, industry: formData.get("industry") as string })
    .eq("id", orgId).select("id");
  if (error) throw error;
  if (!affected1 || affected1.length === 0) throw new UserFacingError("対象が見つかりません");
  revalidatePath("/organizations");
}
