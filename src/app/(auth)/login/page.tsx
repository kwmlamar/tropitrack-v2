"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    const err = searchParams?.get("error");
    if (err === "auth_callback") {
      toast({
        title: "Sign-in failed",
        description: "Google sign-in could not be completed. Please try again or use email and password.",
        variant: "destructive",
      });
      router.replace("/login");
    }
  }, [searchParams, router, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!email || !password) {
      toast({
        title: "Missing information",
        description: "Please enter both email and password.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("Login error:", error);
        const isNetworkError =
          error.message?.includes("Load failed") ||
          error.message?.includes("Failed to fetch") ||
          error.message?.includes("NetworkError") ||
          error.name === "AuthRetryableFetchError";
        toast({
          title: "Login failed",
          description: isNetworkError
            ? "Cannot reach the server. The service may be temporarily unavailable—try again in a few minutes or check status at supabase.com/dashboard."
            : error.message || "Invalid email or password. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Wait a moment for session to be established
        await new Promise(resolve => setTimeout(resolve, 100));
        
        toast({
          title: "Welcome back!",
          description: "You have successfully logged in.",
          variant: "success",
        });
        
        // Use window.location for more reliable redirect
        window.location.href = "/dashboard";
      } else {
        toast({
          title: "Login failed",
          description: "No user data returned. Please try again.",
          variant: "destructive",
        });
        setLoading(false);
      }
    } catch (error) {
      console.error("Unexpected login error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-amber-50 dark:from-neutral-950 dark:to-neutral-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">TropiTrack v2</CardTitle>
          <CardDescription>
            Construction Project Management System
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@tropitrack.bs"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <GoogleSignInButton disabled={loading} />
            <div className="text-sm text-muted-foreground text-center space-y-2">
              <Link href="/forgot-password" className="text-primary hover:underline block">
                Forgot your password?
              </Link>
              <div>
                Don't have an account?{" "}
                <Link href="/signup" className="text-primary hover:underline">
                  Sign up
                </Link>
              </div>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-amber-50 dark:from-neutral-950 dark:to-neutral-900">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
