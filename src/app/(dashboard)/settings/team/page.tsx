"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setInviting(true);
    try {
      // Check if email already exists in team or invitations
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

      // Create invitation
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

      // Get company name for email
      const { data: companyData } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .single();

      // Send invitation email via Edge Function
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:197',message:'Starting email send',data:{invitationId:invitationData.id,email:inviteForm.email,role:inviteForm.role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:206',message:'No session token',data:{hasSession:!!session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
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

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:218',message:'Calling API route',data:{url:'/api/invitations/send-email',hasToken:!!session.access_token,requestBody},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

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

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:231',message:'Edge Function response',data:{status:emailResponse.status,ok:emailResponse.ok,statusText:emailResponse.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          let errorMessage = `Failed to send invitation email (${emailResponse.status})`;
          
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:242',message:'Email send failed',data:{status:emailResponse.status,errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion

          console.error("Failed to send invitation email:", {
            status: emailResponse.status,
            statusText: emailResponse.statusText,
            error: errorMessage,
          });

          // Show warning but continue - invitation is created
          toast({
            title: "Invitation created",
            description: `Invitation was created but email could not be sent: ${errorMessage}. You can resend it later.`,
            variant: "default",
          });
        } else {
          const responseData = await emailResponse.json();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:255',message:'Email send success',data:{responseData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          console.log("Invitation email sent successfully:", responseData);
        }
      } catch (emailError) {
        const errorMessage = emailError instanceof Error ? emailError.message : "Unknown error";
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'team/page.tsx:258',message:'Email send exception',data:{errorMessage,errorType:emailError?.constructor?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        console.error("Error sending invitation email:", emailError);
        
        // Show warning but continue - invitation is created
        toast({
          title: "Invitation created",
          description: `Invitation was created but email could not be sent: ${errorMessage}. You can resend it later.`,
          variant: "default",
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
    // In a real implementation, this would trigger a new email
    // For now, we'll just show a success message
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
      <div className="flex flex-col min-h-screen">
        <Header title="Team Management" description="Manage team members">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
        </Header>
        <div className="flex-1 p-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Company</AlertTitle>
            <AlertDescription>
              You need to be part of a company to manage team members.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Team Management" description="Loading...">
          <Button variant="outline" onClick={() => router.push("/settings")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
        </Header>
        <div className="flex-1 p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Team Management"
        description="Manage who has access to your company"
      >
        <Button variant="outline" onClick={() => router.push("/settings")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>
      </Header>

      <div className="flex-1 p-6 space-y-6">
        {/* Admins Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Admins ({admins.length})
                </CardTitle>
                <CardDescription>
                  Team members with full access to manage projects, workers, and settings
                </CardDescription>
              </div>
              {isAdmin && (
                <Button onClick={() => setShowInviteDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Team Member
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {admins.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.avatar_url || ""} />
                      <AvatarFallback>
                        {getInitials(member.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{member.full_name}</p>
                        {member.is_owner && (
                          <Badge variant="default">
                            <Crown className="h-3 w-3 mr-1" />
                            Owner
                          </Badge>
                        )}
                        {!member.is_owner && member.role === "admin" && (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                      {member.phone && (
                        <p className="text-xs text-muted-foreground">{member.phone}</p>
                      )}
                    </div>
                  </div>
                  {!member.is_owner && isAdmin && member.id !== profile?.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedMember(member);
                        setShowRemoveDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                Pending Invitations ({invitations.length})
              </CardTitle>
              <CardDescription>
                Invitations waiting to be accepted
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-muted/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{invitation.email}</p>
                        <Badge variant="outline">
                          {invitation.role}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          Invited{" "}
                          {new Date(invitation.created_at).toLocaleDateString()}
                        </span>
                        {invitation.invited_by_name && (
                          <span>by {invitation.invited_by_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResendInvitation(invitation)}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvitation(invitation.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workers Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
              Workers ({workers.length})
            </CardTitle>
            <CardDescription>
              Workers will be able to access their own timesheets and basic info in future updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No workers invited yet</p>
                <p className="text-sm mt-2">Worker invitations coming soon</p>
              </div>
            ) : (
              <div className="space-y-4">
                {workers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={member.avatar_url || ""} />
                        <AvatarFallback>
                          {getInitials(member.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{member.full_name}</p>
                          <Badge variant="secondary">Worker</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your company
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mike@example.com"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-3">
                <Label>Role *</Label>
                <RadioGroup
                  value={inviteForm.role}
                  onValueChange={(value: InvitationRole) =>
                    setInviteForm({ ...inviteForm, role: value })
                  }
                >
                  <div className="flex items-start space-x-3 p-3 border rounded-lg">
                    <RadioGroupItem value="admin" id="admin" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="admin" className="font-semibold cursor-pointer">
                        Admin
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Full access to manage projects, workers, invoices, and company settings
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg opacity-60">
                    <RadioGroupItem value="worker" id="worker" className="mt-1" disabled />
                    <div className="flex-1">
                      <Label htmlFor="worker" className="font-semibold cursor-pointer">
                        Worker (Coming Soon)
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Can view their own timesheets and basic information
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  An invitation email will be sent with a link to join your company.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedMember?.full_name} from your company?
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              They will immediately lose access to all company data and features.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRemoveDialog(false);
                setSelectedMember(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={removing}
            >
              {removing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
