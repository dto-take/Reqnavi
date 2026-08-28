import { redirect } from "next/navigation";
import { createServerActionClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createServerActionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("force_password_reset")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (profile?.force_password_reset) redirect("/reset-password");
  redirect("/projects");
}
