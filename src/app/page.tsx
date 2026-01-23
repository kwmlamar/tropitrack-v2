import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Force dynamic rendering to prevent build-time errors
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
