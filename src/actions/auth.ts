"use server";

import { createServerActionClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithPassword(formData: FormData) {
  const supabase = await createServerActionClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/");
}

export async function updatePassword(formData: FormData) {
  const supabase = await createServerActionClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const password = formData.get("password") as string;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  const { error: profileError } = await supabase
    .from("user_profiles")
    .update({ force_password_reset: false })
    .eq("user_id", userData.user.id);
  if (profileError) throw profileError;

  redirect("/projects");
}

export async function signInWithGoogle() {
  const supabase = await createServerActionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "unknown")}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerActionClient();
  await supabase.auth.signOut();
  redirect("/login");
}
