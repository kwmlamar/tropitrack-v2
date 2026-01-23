import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // At runtime in the browser, env vars must be available
  // Only use placeholders during build/SSR when window is not available
  const isBrowser = typeof window !== "undefined";
  
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isBrowser) {
      // In browser at runtime, throw error if env vars are missing
      console.error(
        "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel environment variables."
      );
      throw new Error(
        "Supabase configuration is missing. Please contact support."
      );
    }
    
    // During build/SSR, use placeholders to prevent build errors
    return createBrowserClient(
      "https://placeholder.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
