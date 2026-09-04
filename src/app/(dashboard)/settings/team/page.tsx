"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import {
  Users,
  UserPlus,
  Mail,
  Clock,
  Trash2,
  ArrowLeft,
  Loader2,
  Crown,
  Shield,
  AlertCircle,
} from "lucide-react";
import { getInitials, cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TeamMember, InvitationWithDetails, InvitationRole } from "@/types";

export default function TeamManagementPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationWithDetails[]>([]);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "admin" as InvitationRole,
  });
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [regeneratingCode, setRegeneratingCode] = useState(false);

  useEffect(() => {
    if (profile?.company_id) {
      fetchTeamData();
    } else {
      setLoading(false);
    }
  }, [profile?.company_id]);

  const fetchTeamData = async () => {
    if (!profile?.company_id) return;

    setLoading(true);
    try {
      // Fetch team members
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at");

      if (membersError) throw membersError;

      // Fetch pending invitations
      const { data: invites, error: invitesError } = await supabase
        .from("invitations")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (invitesError) throw invitesError;

      // Fetch inviter profiles separately
      const inviterIds = invites?.map((inv) => inv.invited_by).filter(Boolean) || [];
      let inviterProfiles: Record<string, { full_name: string; email: string }> = {};
      
      if (inviterIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", inviterIds);
        
        if (profilesData) {
          inviterProfiles = profilesData.reduce((acc, profile) => {
            acc[profile.id] = { full_name: profile.full_name, email: profile.email };
            return acc;
          }, {} as Record<string, { full_name: string; email: string }>);
        }
      }

      setTeamMembers(members || []);
      setInvitations(invites?.map((inv) => {
        const inviterProfile = inviterProfiles[inv.invited_by];
        return {
          ...inv,
          invited_by_name: inviterProfile?.full_name,
          invited_by_email: inviterProfile?.email,
        };
      }) || []);

      // Fetch company join code
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("join_code")
        .eq("id", profile.company_id)
        .single();

      if (!companyError && companyData) {
        setJoinCode(companyData.join_code);
      } else if (companyError) {
        console.warn("Could not fetch join code:", companyError);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const regenerateJoinCode = async () => {
    if (!profile?.company_id) return;

    setRegeneratingCode(true);
    try {
      const generateCode = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 8; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
      };

      let newCode = generateCode();
      let attempts = 0;
      let codeExists = true;

      while (codeExists && attempts < 10) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id")
          .eq("join_code", newCode)
          .single();

        if (!existing) {
          codeExists = false;
        } else {
          newCode = generateCode();
          attempts++;
        }
      }

      const { error: updateError } = await supabase
        .from("companies")
        .update({ join_code: newCode })
        .eq("id", profile.company_id);

      if (updateError) throw updateError;

      setJoinCode(newCode);
      toast({
        title: "Join code regenerated",
        description: "A new join code has been generated.",
      });
    } catch (error) {
      console.error("Error regenerating join code:", error);
      toast({
        title: "Error",
        description: "Failed to regenerate join code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingCode(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setInviting(true);
    try {
      const existingMember = teamMembers.find(m => m.email === inviteForm.email);
      const existingInvite = invitations.find(i => i.email === inviteForm.email);

      if (existingMember) {
        toast({
          title: "Already a team member",
          description: "This user is already part of your team.",
          variant: "destructive",
        });
        return;
      }

      if (existingInvite) {
        toast({
          title: "Invitation already sent",
          description: "An invitation has already been sent to this email.",
          variant: "destructive",
        });
        return;
      }

      // Generate token
      const { data: tokenData, error: tokenError } = await supabase
        .rpc("generate_invitation_token");

      if (tokenError) throw tokenError;
      if (!tokenData) throw new Error("Failed to generate invitation token");

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

      const { data: invitationData, error: inviteError } = await supabase
        .from("invitations")
        .insert({
          company_id: profile.company_id,
          email: inviteForm.email,
          role: inviteForm.role,
          invited_by: profile.id,
          token: tokenData,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (inviteError) throw inviteError;

      const { data: companyData } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .single();

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("No authentication session found");
        }

        const requestBody = {
          invitation_id: invitationData.id,
          email: inviteForm.email,
          role: inviteForm.role,
          token: tokenData,
          company_name: companyData?.name || "TropiTech Solutions",
          inviter_name: profile.full_name || "Team Admin",
        };

        const emailResponse = await fetch(
          `/api/invitations/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          let errorMessage = `Failed to send invitation email (${emailResponse.status})`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          console.error("Failed to send invitation email:", errorMessage);
          toast({
            title: "Invitation created",
            description: `Invitation was created but email could not be sent: ${errorMessage}. You can resend it later.`,
          });
        } else {
          const responseData = await emailResponse.json();
          console.log("Invitation email sent successfully:", responseData.email_id);
        }
      } catch (emailError) {
        const errorMessage = emailError instanceof Error ? emailError.message : "Unknown error";
        console.error("Error sending invitation email:", emailError);
        toast({
          title: "Invitation created",
          description: `Invitation was created but email could not be sent: ${errorMessage}. You can resend it later.`,
        });
      }

      toast({
        title: "Invitation sent",
        description: `An invitation email has been sent to ${inviteForm.email}`,
        variant: "success",
      });

      setShowInviteDialog(false);
      setInviteForm({ email: "", role: "admin" });
      fetchTeamData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error sending invitation",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from("invitations")
        .update({ status: "cancelled" })
        .eq("id", invitationId);

      if (error) throw error;

      toast({
        title: "Invitation cancelled",
        variant: "success",
      });

      fetchTeamData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleResendInvitation = async (invitation: InvitationWithDetails) => {
    toast({
      title: "Invitation resent",
      description: `A new invitation email has been sent to ${invitation.email}`,
      variant: "success",
    });
  };

  const handleRemoveMember = async () => {
    if (!selectedMember || !profile?.id) return;

    setRemoving(true);
    try {
      const { error } = await supabase
        .rpc("remove_team_member", {
          p_user_id: selectedMember.id,
          p_removed_by: profile.id,
        });

      if (error) throw error;

      toast({
        title: "Team member removed",
        description: `${selectedMember.full_name} has been removed from your team.`,
        variant: "success",
      });

      setShowRemoveDialog(false);
      setSelectedMember(null);
      fetchTeamData();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
    }
  };

  const isAdmin = profile?.role === "admin" || profile?.role === "project_manager";
  const admins = teamMembers.filter(m => m.role === "admin" || m.role === "project_manager");
  const workers = teamMembers.filter(m => m.role === "worker");

  if (!profile?.company_id) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Team Management</h1>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-hover text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Settings
          </button>
        </div>
        <div className="flex-1 p-6">
          <div className="bg-destructive-subtle border border-destructive-border rounded-lg p-4 flex gap-3 text-[12px] text-destructive">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>You need to be part of a company to manage team members.</div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-background">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
            <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Team Management</h1>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-hover text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Settings
          </button>
        </div>
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Team Management</h1>
        </div>
        <button
          onClick={() => router.push("/settings")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-hover text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Settings
        </button>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Company Join Code Section */}
        {isAdmin && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                <Users className="h-4 w-4 text-success" />
                Company Join Code
              </h2>
              <p className="text-[11px] text-foreground-lighter mt-1">
                Share this code with team members so they can join your company during signup
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-info-subtle border border-info-border rounded-lg p-4 flex gap-3 text-[12px] text-info">
                <AlertCircle className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-info mb-0.5">Alternative to Email Invitations</p>
                  <p>Instead of sending email invitations, you can share this code with team members. They can enter it when signing up to automatically join your company.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-border rounded-lg bg-background">
                <div className="flex-1">
                  <label className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Join Code</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-2xl font-bold tracking-wider font-mono bg-surface-100 px-4 py-1.5 rounded-md border border-border text-foreground">
                      {joinCode || "Loading..."}
                    </code>
                  </div>
                  <p className="text-[10px] text-foreground-lighter tabular-nums mt-2">
                    Users can enter this code at: {typeof window !== "undefined" ? window.location.origin : ""}/signup
                  </p>
                </div>
                <button
                  onClick={regenerateJoinCode}
                  disabled={regeneratingCode}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-surface-300 border border-strong text-[11px] font-mono uppercase tracking-wider text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
                >
                  {regeneratingCode ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <Users className="h-3.5 w-3.5" />
                      Regenerate Code
                    </>
                  )}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (joinCode) {
                      navigator.clipboard.writeText(joinCode);
                      toast({
                        title: "Copied!",
                        description: "Join code copied to clipboard",
                      });
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-hover text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
                >
                  Copy Code
                </button>
                <button
                  onClick={() => {
                    if (joinCode && typeof window !== "undefined") {
                      const signupUrl = `${window.location.origin}/signup?code=${joinCode}`;
                      navigator.clipboard.writeText(signupUrl);
                      toast({
                        title: "Copied!",
                        description: "Signup link with code copied to clipboard",
                      });
                    }
                  }}
                  className="px-3 py-1.5 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-hover text-[11px] font-medium text-foreground-lighter hover:text-foreground-light transition-colors"
                >
                  Copy Signup Link
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admins Section */}
        <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                <Shield className="h-4 w-4 text-info" />
                Admins ({admins.length})
              </h2>
              <p className="text-[11px] text-foreground-lighter mt-1">
                Team members with full access to manage projects, workers, and settings
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowInviteDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-300 border border-strong text-[11px] font-mono uppercase tracking-wider text-brand hover:bg-surface-400 transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite Member
              </button>
            )}
          </div>

          <div className="space-y-3">
            {admins.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-surface-400 flex items-center justify-center text-[13px] tabular-nums font-semibold text-foreground-light flex-shrink-0">
                    {getInitials(member.full_name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[13px] text-foreground">{member.full_name}</p>
                      {member.is_owner && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] tabular-nums bg-warning-subtle text-warning border border-warning-border">
                          <Crown className="h-2.5 w-2.5 mr-1" />
                          Owner
                        </span>
                      )}
                      {!member.is_owner && member.role === "admin" && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] tabular-nums bg-surface-300 text-foreground-light border border-strong">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-foreground-lighter tabular-nums">{member.email}</p>
                    {member.phone && (
                      <p className="text-[10px] text-foreground-lighter tabular-nums">{member.phone}</p>
                    )}
                  </div>
                </div>
                {!member.is_owner && isAdmin && member.id !== profile?.id && (
                  <button
                    onClick={() => {
                      setSelectedMember(member);
                      setShowRemoveDialog(true);
                    }}
                    className="p-1 text-foreground-lighter hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                <Mail className="h-4 w-4 text-warning" />
                Pending Invitations ({invitations.length})
              </h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Invitations waiting to be accepted</p>
            </div>

            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[13px] text-foreground">{invitation.email}</p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] tabular-nums bg-info-subtle text-info border border-info-border">
                        {invitation.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-foreground-lighter tabular-nums mt-1">
                      <Clock className="h-3 w-3" />
                      <span>Invited {new Date(invitation.created_at).toLocaleDateString()}</span>
                      {invitation.invited_by_name && (
                        <span>by {invitation.invited_by_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResendInvitation(invitation)}
                      className="px-2 py-1 rounded-md border border-border bg-surface-100 hover:bg-surface-300 text-[11px] text-foreground-lighter hover:text-foreground-light transition-colors"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => handleCancelInvitation(invitation.id)}
                      className="px-2 py-1 rounded-md border border-transparent hover:bg-destructive-subtle text-[11px] text-foreground-lighter hover:text-destructive transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workers Section */}
        <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
          <div>
            <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
              <Users className="h-4 w-4 text-success" />
              Workers ({workers.length})
            </h2>
            <p className="text-[11px] text-foreground-lighter mt-1">
              Workers will be able to access their own timesheets and basic info in future updates
            </p>
          </div>

          {workers.length === 0 ? (
            <div className="text-center py-6 text-foreground-lighter text-[12px]">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50 text-foreground-lighter" />
              <p>No workers invited yet</p>
              <p className="text-[10px] mt-0.5 tabular-nums">Worker invitations coming soon</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-background"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-surface-400 flex items-center justify-center text-[13px] tabular-nums font-semibold text-foreground-light flex-shrink-0">
                      {getInitials(member.full_name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[13px] text-foreground">{member.full_name}</p>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] tabular-nums bg-success-subtle text-success border border-success-border">
                          Worker
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground-lighter tabular-nums">{member.email}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle className="text-foreground text-[15px]">Invite Team Member</DialogTitle>
              <DialogDescription className="text-foreground-lighter text-[12px] mt-1">
                Send an invitation to join your company
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1">
                <label htmlFor="email" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Email Address *</label>
                <input
                  id="email"
                  type="email"
                  placeholder="mike@example.com"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  required
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-hover transition-colors placeholder:text-foreground-lighter"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Role *</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border border-border rounded-lg bg-background cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={inviteForm.role === "admin"}
                      onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as InvitationRole })}
                      className="h-4 w-4 bg-surface-100 border-strong text-brand focus:ring-0 focus:ring-offset-0 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-[13px] text-foreground">Admin</span>
                      <p className="text-[11px] text-foreground-lighter mt-0.5">Full access to manage projects, workers, invoices, and company settings</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border border-border/50 rounded-lg bg-background/50 opacity-50 cursor-not-allowed">
                    <input
                      type="radio"
                      name="role"
                      value="worker"
                      disabled
                      className="h-4 w-4 bg-surface-100 border-strong text-brand focus:ring-0 focus:ring-offset-0 mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-[13px] text-foreground-lighter">Worker (Coming Soon)</span>
                      <p className="text-[11px] text-foreground-lighter mt-0.5">Can view their own timesheets and basic information</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-info-subtle border border-info-border rounded-lg p-4 flex gap-3 text-[12px] text-info">
                <AlertCircle className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
                <div>An invitation email will be sent with a link to join your company.</div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setShowInviteDialog(false)}
                className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {inviting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                Send Invitation
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent className="max-w-md bg-surface-100 border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[15px]">Remove Team Member</DialogTitle>
            <DialogDescription className="text-foreground-lighter text-[12px] mt-1">
              Are you sure you want to remove {selectedMember?.full_name} from your company?
            </DialogDescription>
          </DialogHeader>

          <div className="bg-destructive-subtle border border-destructive-border rounded-lg p-4 flex gap-3 text-[12px] text-destructive my-3">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>They will immediately lose access to all company data and features.</div>
          </div>

          <DialogFooter className="pt-2">
            <button
              onClick={() => {
                setShowRemoveDialog(false);
                setSelectedMember(null);
              }}
              className="px-4 py-2 text-[12px] text-foreground-lighter hover:text-foreground-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveMember}
              disabled={removing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-destructive-solid border border-destructive-solid text-[12px] font-medium text-destructive-foreground hover:bg-destructive transition-colors disabled:opacity-40"
            >
              {removing && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Remove Member
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
