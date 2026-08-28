"use server";

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

export async function createOrganization(formData: FormData) {
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

export async function updateOrganization(orgId: string, formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!["admin", "pm"].includes(claims?.claims?.user_role as string)) {
    throw new UserFacingError("PM以上の権限が必要です");
  }

  const { error } = await supabase
    .from("organizations")
    .update({ name: formData.get("name") as string, industry: formData.get("industry") as string })
    .eq("id", orgId);
  if (error) throw error;
  revalidatePath("/organizations");
}
