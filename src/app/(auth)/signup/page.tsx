"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, Mail, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SignupPage() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validatingInvite, setValidatingInvite] = useState(false);
  const [invitationValid, setInvitationValid] = useState(false);
  const [invitationData, setInvitationData] = useState<{
    company_name: string;
    role: string;
    email: string;
  } | null>(null);

  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  // Validate invitation token on mount
  useEffect(() => {
    if (inviteToken) {
      validateInvitation();
    }
  }, [inviteToken]);

  const validateInvitation = async () => {
    if (!inviteToken) return;

    setValidatingInvite(true);
    try {
      const { data, error } = await supabase
        .rpc("validate_invitation_token", { p_token: inviteToken });

      if (error || !data || data.length === 0) {
        toast({
          title: "Invalid Invitation",
          description: "This invitation link is invalid or has expired.",
          variant: "destructive",
        });
        setInvitationValid(false);
      } else {
        const invitation = Array.isArray(data) ? data[0] : data;
        setInvitationData({
          company_name: invitation.company_name,
          role: invitation.role,
          email: invitation.email,
        });
        setEmail(invitation.email);
        setInvitationValid(true);
      }
    } catch (error) {
      console.error("Error validating invitation:", error);
      toast({
        title: "Error",
        description: "Failed to validate invitation. Please try again.",
        variant: "destructive",
      });
      setInvitationValid(false);
    } finally {
      setValidatingInvite(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate passwords match
    if (password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      // Sign up the user
      const { data: authData, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (signupError) {
        toast({
          title: "Signup failed",
          description: signupError.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // If there's an invitation token, accept it
      if (inviteToken && authData.user) {
        const { data: acceptData, error: acceptError } = await supabase
          .rpc("accept_invitation", {
            p_token: inviteToken,
            p_user_id: authData.user.id,
          });

        if (acceptError) {
          console.error("Error accepting invitation:", acceptError);
          // Continue anyway - user account is created
        }

        if (acceptData) {
          toast({
            title: "Welcome to the team!",
            description: `You've successfully joined ${invitationData?.company_name}`,
            variant: "success",
          });
        }
      } else {
        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
          variant: "success",
        });
      }

      // Redirect to dashboard or login
      if (inviteToken) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
      router.refresh();
    } catch (error) {
      console.error("Signup error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (validatingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-amber-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-amber-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">TropiTrack v2</CardTitle>
          <CardDescription>
            {inviteToken && invitationValid
              ? `Join ${invitationData?.company_name}`
              : "Create your account to get started"}
          </CardDescription>
        </CardHeader>

        {inviteToken && invitationValid && invitationData && (
          <div className="px-6 pb-4">
            <Alert className="bg-blue-50 border-blue-200">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold mb-1">
                      You've been invited to join {invitationData.company_name}
                    </p>
                    <p className="text-sm">
                      Role: <Badge variant="secondary">{invitationData.role}</Badge>
                    </p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {inviteToken && !invitationValid && !validatingInvite && (
          <div className="px-6 pb-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This invitation link is invalid or has expired. Please request a new invitation.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@tropitrack.bs"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || (inviteToken && invitationValid)}
                readOnly={inviteToken && invitationValid}
                className={inviteToken && invitationValid ? "bg-muted" : ""}
              />
              {inviteToken && invitationValid && (
                <p className="text-xs text-muted-foreground">
                  Email is pre-filled from your invitation
                </p>
              )}
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
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={loading || (inviteToken && !invitationValid)}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {inviteToken && invitationValid ? "Create Account & Join" : "Create Account"}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
