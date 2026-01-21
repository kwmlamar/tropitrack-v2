"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import {
  User,
  Building2,
  Bell,
  Shield,
  Loader2,
  Sparkles,
  Wallet,
  Info,
  Palette,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AITone } from "@/types";

export default function SettingsPage() {
  const { profile, session, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const supabase = createClient();

  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [aiPreferences, setAiPreferences] = useState({
    tone: "professional" as AITone,
    search_history_enabled: true,
    auto_draft_enabled: true,
  });

  // Load AI preferences on mount
  useState(() => {
    const loadAiPreferences = async () => {
      if (!profile?.id) return;

      const { data } = await supabase
        .from("user_ai_preferences")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      if (data) {
        setAiPreferences({
          tone: data.tone || "professional",
          search_history_enabled: data.search_history_enabled ?? true,
          auto_draft_enabled: data.auto_draft_enabled ?? true,
        });
      }
    };

    loadAiPreferences();
  });

  const handleAiPreferencesUpdate = async () => {
    if (!profile?.id) return;

    setAiLoading(true);
    try {
      const { error } = await supabase
        .from("user_ai_preferences")
        .upsert({
          user_id: profile.id,
          tone: aiPreferences.tone,
          search_history_enabled: aiPreferences.search_history_enabled,
          auto_draft_enabled: aiPreferences.auto_draft_enabled,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "user_id",
        });

      if (error) throw error;

      toast({
        title: "AI preferences saved",
        description: "Your AI settings have been updated.",
        variant: "success",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profileForm.full_name,
          phone: profileForm.phone || null,
        })
        .eq("id", profile.id);

      if (error) throw error;

      await refreshProfile();

      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
        variant: "success",
      });
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

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.new_password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new_password,
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been successfully changed.",
        variant: "success",
      });

      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
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

  return (
    <div className="flex flex-col min-h-screen">
      <Header title="Settings" description="Manage your account and preferences" />

      <div className="flex-1 p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="company" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company
            </TabsTrigger>
            <TabsTrigger value="payroll" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payroll
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              AI Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileUpdate} className="space-y-6">
                  <div className="flex items-center gap-6">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={profile?.avatar_url || ""} />
                      <AvatarFallback className="text-xl">
                        {profile?.full_name ? getInitials(profile.full_name) : "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">{profile?.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{profile?.email}</p>
                      <p className="text-sm text-muted-foreground capitalize">
                        {profile?.role?.replace("_", " ")}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={profileForm.full_name}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, full_name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={profile?.email || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        placeholder="(242) 555-1234"
                        value={profileForm.phone}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, phone: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Input
                        id="role"
                        value={profile?.role?.replace("_", " ") || ""}
                        disabled
                        className="bg-muted capitalize"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="new_password">New Password</Label>
                    <Input
                      id="new_password"
                      type="password"
                      placeholder="Enter new password"
                      value={passwordForm.new_password}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, new_password: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      placeholder="Confirm new password"
                      value={passwordForm.confirm_password}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                      }
                    />
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Update Password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize how TropiTrack looks on your device
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium mb-4">Theme</h3>
                  <div className="grid gap-4 sm:grid-cols-3 max-w-lg">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        theme === "light"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                        <Sun className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <span className="font-medium">Light</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Bright and clear
                      </span>
                    </button>

                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        theme === "dark"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="p-3 rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <Moon className="h-6 w-6 text-neutral-600 dark:text-neutral-300" />
                      </div>
                      <span className="font-medium">Dark</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Easy on the eyes
                      </span>
                    </button>

                    <button
                      onClick={() => setTheme("system")}
                      className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        theme === "system"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <Monitor className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="font-medium">System</span>
                      <span className="text-xs text-muted-foreground text-center">
                        Match your device
                      </span>
                    </button>
                  </div>
                </div>

                <Separator />

                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium mb-1">About System Theme</p>
                      <p>When set to System, TropiTrack will automatically switch between
                      light and dark modes based on your device&apos;s display settings.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company Settings</CardTitle>
                <CardDescription>
                  Configure your company information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input
                      id="company_name"
                      placeholder="Your Company Ltd."
                      defaultValue="TropiTech Solutions"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business_number">Business Registration Number</Label>
                    <Input
                      id="business_number"
                      placeholder="BRN-XXXXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_address">Address</Label>
                    <Input
                      id="company_address"
                      placeholder="Business address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value="BSD (Bahamian Dollar)"
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value="America/Nassau (EST)"
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                  <Button>
                    Save Company Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payroll">
            <Card>
              <CardHeader>
                <CardTitle>Payroll Settings</CardTitle>
                <CardDescription>
                  National Insurance Board (NIB) deduction rates and payroll configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* NIB Information Section */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    NIB (National Insurance Board) Contributions
                  </h3>

                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 mb-4">
                    <div className="flex gap-3">
                      <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-1">Mandatory Payroll Deductions</p>
                        <p>NIB contributions are mandatory for all employed persons in The Bahamas.
                        The rates below are set by law and apply to all workers.</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Employee Contribution</p>
                      <p className="text-2xl font-bold text-primary">4.65%</p>
                      <p className="text-xs text-muted-foreground mt-1">Deducted from gross wages</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Employer Contribution</p>
                      <p className="text-2xl font-bold text-primary">6.65%</p>
                      <p className="text-xs text-muted-foreground mt-1">Paid by employer</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-sm text-muted-foreground mb-1">Weekly Max Insurable</p>
                      <p className="text-2xl font-bold text-primary">$550</p>
                      <p className="text-xs text-muted-foreground mt-1">Maximum weekly wages</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* How NIB is calculated */}
                <div>
                  <h4 className="font-medium mb-3">How NIB Deductions Are Calculated</h4>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium">1</span>
                      <p>Calculate gross wages for the pay period (regular hours × rate + overtime hours × OT rate)</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium">2</span>
                      <p>Cap weekly wages at $550 for NIB calculation purposes</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium">3</span>
                      <p>Employee deduction: Capped wages × 4.65% (deducted from paycheck)</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium">4</span>
                      <p>Employer contribution: Capped wages × 6.65% (company expense, not deducted)</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Worker NIB Settings Note */}
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                      <p className="font-medium mb-1">Per-Worker NIB Settings</p>
                      <p>NIB deductions can be enabled or disabled for individual workers in their profile.
                      Go to Workers → Edit Worker to manage NIB settings and enter their NIB number.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b">
                    <div>
                      <p className="font-medium">Low Stock Alerts</p>
                      <p className="text-sm text-muted-foreground">
                        Get notified when materials fall below minimum levels
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b">
                    <div>
                      <p className="font-medium">Milestone Reminders</p>
                      <p className="text-sm text-muted-foreground">
                        Reminders for upcoming project milestones
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                  <div className="flex items-center justify-between py-3 border-b">
                    <div>
                      <p className="font-medium">Payroll Reminders</p>
                      <p className="text-sm text-muted-foreground">
                        Notifications for pay period deadlines
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">Budget Alerts</p>
                      <p className="text-sm text-muted-foreground">
                        Warnings when projects approach budget limits
                      </p>
                    </div>
                    <input type="checkbox" defaultChecked className="h-5 w-5" />
                  </div>
                  <Button>
                    Save Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Features
                </CardTitle>
                <CardDescription>
                  Configure AI-powered search and content generation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6 max-w-md">
                  <div className="space-y-3">
                    <Label htmlFor="ai_tone">Default Writing Tone</Label>
                    <Select
                      value={aiPreferences.tone}
                      onValueChange={(value: AITone) =>
                        setAiPreferences({ ...aiPreferences, tone: value })
                      }
                    >
                      <SelectTrigger id="ai_tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">
                          Professional - Formal business language
                        </SelectItem>
                        <SelectItem value="concise">
                          Concise - Brief and to-the-point
                        </SelectItem>
                        <SelectItem value="detailed">
                          Detailed - Comprehensive with technical details
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This affects how AI generates descriptions for estimates, invoices, and other content
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Smart Search History</p>
                        <p className="text-sm text-muted-foreground">
                          Save your search queries for quick access
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={aiPreferences.search_history_enabled}
                        onChange={(e) =>
                          setAiPreferences({
                            ...aiPreferences,
                            search_history_enabled: e.target.checked,
                          })
                        }
                        className="h-5 w-5"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-Draft Descriptions</p>
                        <p className="text-sm text-muted-foreground">
                          Show AI generation button on description fields
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={aiPreferences.auto_draft_enabled}
                        onChange={(e) =>
                          setAiPreferences({
                            ...aiPreferences,
                            auto_draft_enabled: e.target.checked,
                          })
                        }
                        className="h-5 w-5"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">Usage Limits</p>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Smart searches: 50 per day</p>
                      <p>Content generations: 100 per day</p>
                    </div>
                  </div>

                  <Button onClick={handleAiPreferencesUpdate} disabled={aiLoading}>
                    {aiLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save AI Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
