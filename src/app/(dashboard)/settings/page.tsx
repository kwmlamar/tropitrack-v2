"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import { getInitials, cn } from "@/lib/utils";
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
  Users,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiStatusPanel } from "@/components/ai/ai-status-panel";
import type { AITone } from "@/types";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { profile, session, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState("profile");

  const [profileForm, setProfileForm] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [companyForm, setCompanyForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    vat_number: "",
    business_registration: "",
  });

  const [aiPreferences, setAiPreferences] = useState({
    tone: "professional" as AITone,
    search_history_enabled: true,
    auto_draft_enabled: true,
  });

  const [notificationPrefs, setNotificationPrefs] = useState({
    low_stock_alerts: true,
    milestone_reminders: true,
    payroll_reminders: true,
    budget_alerts: true,
    invoice_overdue_alerts: true,
    estimate_expiring_alerts: true,
    team_notifications: true,
    payment_notifications: true,
  });

  const [notificationLoading, setNotificationLoading] = useState(false);

  // Load AI preferences and company data on mount
  useEffect(() => {
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

    const loadCompanyData = async () => {
      if (!profile?.company_id) return;

      const { data, error } = await supabase
        .from("companies")
        .select("name, email, phone, address, city, vat_tax_id, business_registration_number")
        .eq("id", profile.company_id)
        .single();

      if (error) {
        console.error("Error loading company data:", error);
        return;
      }

      if (data) {
        setCompanyForm({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          city: data.city || "",
          vat_number: data.vat_tax_id || "",
          business_registration: data.business_registration_number || "",
        });
      }
    };

    const loadNotificationPrefs = async () => {
      if (!profile?.id) return;

      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      if (error) {
        console.error("Error loading notification preferences:", error);
        return;
      }

      if (data) {
        setNotificationPrefs({
          low_stock_alerts: data.low_stock_alerts ?? true,
          milestone_reminders: data.milestone_reminders ?? true,
          payroll_reminders: data.payroll_reminders ?? true,
          budget_alerts: data.budget_alerts ?? true,
          invoice_overdue_alerts: data.invoice_overdue_alerts ?? true,
          estimate_expiring_alerts: data.estimate_expiring_alerts ?? true,
          team_notifications: data.team_notifications ?? true,
          payment_notifications: data.payment_notifications ?? true,
        });
      }
    };

    loadAiPreferences();
    loadCompanyData();
    loadNotificationPrefs();
  }, [profile?.id, profile?.company_id]);

  // Sync profileForm with profile data when it loads
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
      });
    }
  }, [profile]);

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

  const handleCompanyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.company_id) return;

    setCompanyLoading(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: companyForm.name || null,
          email: companyForm.email || null,
          phone: companyForm.phone || null,
          address: companyForm.address || null,
          city: companyForm.city || null,
          vat_tax_id: companyForm.vat_number || null,
          business_registration_number: companyForm.business_registration || null,
        })
        .eq("id", profile.company_id);

      if (error) throw error;

      toast({
        title: "Company settings saved",
        description: "Your company information has been updated successfully.",
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
      setCompanyLoading(false);
    }
  };

  const handleNotificationPrefsUpdate = async () => {
    if (!profile?.id) return;

    setNotificationLoading(true);
    try {
      const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(
          {
            user_id: profile.id,
            ...notificationPrefs,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

      if (error) throw error;

      toast({
        title: "Notification preferences saved",
        description: "Your notification settings have been updated.",
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
      setNotificationLoading(false);
    }
  };

  const tabs = [
    { id: "profile", name: "Profile", icon: User },
    { id: "security", name: "Security", icon: Shield },
    { id: "appearance", name: "Appearance", icon: Palette },
    { id: "company", name: "Company", icon: Building2 },
    { id: "payroll", name: "Payroll", icon: Wallet },
    { id: "notifications", name: "Notifications", icon: Bell },
    { id: "ai", name: "AI Settings", icon: Sparkles },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest">Settings</p>
          <h1 className="text-[16px] font-semibold text-foreground mt-0.5">Account & Preferences</h1>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors flex items-center gap-2",
                  isActive
                    ? "bg-surface-300 text-brand border border-strong"
                    : "text-foreground-lighter hover:text-foreground-light"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive ? "text-brand" : "text-foreground-lighter")} />
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        {activeTab === "profile" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-4xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Profile Information</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Update your personal details and contact information</p>
            </div>

            <div className="flex items-center gap-5">
              <div className="h-14 w-14 rounded-full bg-surface-400 flex items-center justify-center text-[16px] tabular-nums font-semibold text-foreground-light flex-shrink-0">
                {profile?.full_name ? getInitials(profile.full_name) : "U"}
              </div>
              <div>
                <h3 className="font-semibold text-[14px] text-foreground">{profile?.full_name}</h3>
                <p className="text-[12px] text-foreground-lighter">{profile?.email}</p>
                <p className="text-[11px] text-foreground-lighter capitalize tabular-nums mt-0.5">
                  {profile?.role?.replace("_", " ")}
                </p>
              </div>
            </div>

            <div className="border-b border-border" />

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="full_name" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Full Name</label>
                  <input
                    id="full_name"
                    value={profileForm.full_name}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, full_name: e.target.value })
                    }
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="email" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Email</label>
                  <input
                    id="email"
                    value={profile?.email || ""}
                    disabled
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong/30 text-[13px] text-foreground-lighter cursor-not-allowed outline-none"
                  />
                  <p className="text-[10px] text-foreground-lighter tabular-nums mt-1">
                    Email cannot be changed
                  </p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="phone" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Phone</label>
                  <input
                    id="phone"
                    placeholder="(242) 555-1234"
                    value={profileForm.phone}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, phone: e.target.value })
                    }
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="role" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Role</label>
                  <input
                    id="role"
                    value={profile?.role?.replace("_", " ") || ""}
                    disabled
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong/30 text-[13px] text-foreground-lighter cursor-not-allowed outline-none capitalize"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "security" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Change Password</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Update your password to keep your account secure</p>
            </div>

            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="new_password" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">New Password</label>
                <input
                  id="new_password"
                  type="password"
                  placeholder="Enter new password"
                  value={passwordForm.new_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, new_password: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="confirm_password" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Confirm New Password</label>
                <input
                  id="confirm_password"
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirm_password}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                  }
                  className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "appearance" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-4xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Appearance</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Customize how Bedrock looks on your device</p>
            </div>

            <div>
              <h3 className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest mb-3">Theme Selection</h3>
              <div className="grid gap-3 sm:grid-cols-3 max-w-lg">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border transition-all text-center",
                    theme === "light"
                      ? "border-primary bg-primary/10 text-brand"
                      : "border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-foreground-lighter hover:text-foreground-light"
                  )}
                >
                  <div className="p-2.5 rounded-full bg-background mb-1">
                    <Sun className="h-5 w-5 text-warning" />
                  </div>
                  <span className="font-medium text-[13px]">Light</span>
                  <span className="text-[10px] opacity-75">Bright and clear</span>
                </button>

                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border transition-all text-center",
                    theme === "dark"
                      ? "border-primary bg-primary/10 text-brand"
                      : "border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-foreground-lighter hover:text-foreground-light"
                  )}
                >
                  <div className="p-2.5 rounded-full bg-background mb-1">
                    <Moon className="h-5 w-5 text-info" />
                  </div>
                  <span className="font-medium text-[13px]">Dark</span>
                  <span className="text-[10px] opacity-75">Easy on the eyes</span>
                </button>

                <button
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-md border transition-all text-center",
                    theme === "system"
                      ? "border-primary bg-primary/10 text-brand"
                      : "border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-foreground-lighter hover:text-foreground-light"
                  )}
                >
                  <div className="p-2.5 rounded-full bg-background mb-1">
                    <Monitor className="h-5 w-5 text-info" />
                  </div>
                  <span className="font-medium text-[13px]">System</span>
                  <span className="text-[10px] opacity-75">Match device settings</span>
                </button>
              </div>
            </div>

            <div className="border-b border-border" />

            <div className="bg-info-subtle border border-info-border rounded-lg p-4 max-w-lg flex gap-3">
              <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-info">
                <p className="font-semibold text-info mb-0.5">About System Theme</p>
                <p>When set to System, Bedrock will automatically switch between light and dark modes based on your device display settings.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "company" && (
          <div className="space-y-5 max-w-4xl">
            <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Company Information</h2>
                <p className="text-[11px] text-foreground-lighter mt-1">Update your company details that appear on invoices and estimates</p>
              </div>

              <form onSubmit={handleCompanyUpdate} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="company_name" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Company Name</label>
                    <input
                      id="company_name"
                      placeholder="Your Company Ltd."
                      value={companyForm.name}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, name: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="company_email" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Company Email</label>
                    <input
                      id="company_email"
                      type="email"
                      placeholder="info@yourcompany.com"
                      value={companyForm.email}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, email: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="company_phone" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Company Phone</label>
                    <input
                      id="company_phone"
                      placeholder="(242) 555-1234"
                      value={companyForm.phone}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, phone: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="city" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">City</label>
                    <input
                      id="city"
                      placeholder="Nassau"
                      value={companyForm.city}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, city: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="company_address" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Business Address</label>
                  <input
                    id="company_address"
                    placeholder="123 Main Street"
                    value={companyForm.address}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, address: e.target.value })
                    }
                    disabled={companyLoading}
                    className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                  />
                </div>

                <div className="border-b border-border" />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="vat_number" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">VAT/Tax ID Number <span className="text-foreground-lighter font-normal font-sans">(Optional)</span></label>
                    <input
                      id="vat_number"
                      placeholder="VAT-XXXXXX"
                      value={companyForm.vat_number}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, vat_number: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="business_number" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Business Registration Number <span className="text-foreground-lighter font-normal font-sans">(Optional)</span></label>
                    <input
                      id="business_number"
                      placeholder="BRN-XXXXXX"
                      value={companyForm.business_registration}
                      onChange={(e) =>
                        setCompanyForm({ ...companyForm, business_registration: e.target.value })
                      }
                      disabled={companyLoading}
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong text-[13px] text-foreground-light outline-none focus:border-strong transition-colors placeholder:text-foreground-lighter"
                    />
                  </div>
                </div>

                <div className="border-b border-border" />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="currency" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Currency</label>
                    <input
                      id="currency"
                      value="BSD (Bahamian Dollar)"
                      disabled
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong/30 text-[13px] text-foreground-lighter cursor-not-allowed outline-none"
                    />
                    <p className="text-[10px] text-foreground-lighter tabular-nums">Currency settings cannot be changed</p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="timezone" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Timezone</label>
                    <input
                      id="timezone"
                      value="America/Nassau (EST)"
                      disabled
                      className="w-full h-8 px-2.5 rounded-md bg-surface-100 border border-strong/30 text-[13px] text-foreground-lighter cursor-not-allowed outline-none"
                    />
                    <p className="text-[10px] text-foreground-lighter tabular-nums">Timezone settings cannot be changed</p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={companyLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
                  >
                    {companyLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                    Save Company Settings
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-4">
              <div>
                <h3 className="text-[13px] font-semibold text-foreground uppercase tracking-wider font-mono">Additional Settings</h3>
                <p className="text-[11px] text-foreground-lighter mt-1">Manage team members and invoice payment configurations</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  className="flex items-center gap-3 w-full p-4 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-left transition-colors group"
                  onClick={() => router.push("/settings/team")}
                >
                  <div className="p-2 rounded-md bg-info-subtle text-info border border-info-border">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[13px] text-foreground group-hover:text-white transition-colors">Team Management</p>
                    <p className="text-[11px] text-foreground-lighter mt-0.5">Invite and manage team members</p>
                  </div>
                </button>

                <button
                  className="flex items-center gap-3 w-full p-4 rounded-md border border-border bg-surface-100 hover:bg-surface-300 hover:border-strong text-left transition-colors group"
                  onClick={() => router.push("/settings/payment")}
                >
                  <div className="p-2 rounded-md bg-success-subtle text-success border border-success-border">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[13px] text-foreground group-hover:text-white transition-colors">Payment Instructions</p>
                    <p className="text-[11px] text-foreground-lighter mt-0.5">Configure invoice payment details</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "payroll" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-4xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Payroll Settings</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">National Insurance Board (NIB) deduction rates and payroll configurations</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-[12px] font-semibold text-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand" />
                NIB (National Insurance Board) Contributions
              </h3>

              <div className="bg-info-subtle border border-info-border rounded-lg p-4 flex gap-3">
                <Info className="h-4 w-4 text-info flex-shrink-0 mt-0.5" />
                <div className="text-[12px] text-info">
                  <p className="font-semibold text-info mb-0.5">Mandatory Payroll Deductions</p>
                  <p>NIB contributions are mandatory for all employed persons in The Bahamas. The rates below are set by law and apply to all workers.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Employee Contribution</p>
                  <p className="text-2xl font-bold tabular-nums text-brand mt-1">4.65%</p>
                  <p className="text-[10px] text-foreground-lighter mt-1">Deducted from gross wages</p>
                </div>
                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Employer Contribution</p>
                  <p className="text-2xl font-bold tabular-nums text-brand mt-1">6.65%</p>
                  <p className="text-[10px] text-foreground-lighter mt-1">Paid by employer</p>
                </div>
                <div className="bg-background border border-border rounded-lg p-4 text-center">
                  <p className="text-[10px] font-mono text-foreground-lighter uppercase tracking-wider">Weekly Max Insurable</p>
                  <p className="text-2xl font-bold tabular-nums text-brand mt-1">$550</p>
                  <p className="text-[10px] text-foreground-lighter mt-1">Maximum weekly wages capped</p>
                </div>
              </div>
            </div>

            <div className="border-b border-border" />

            <div>
              <h4 className="text-[11px] font-mono text-foreground-lighter uppercase tracking-widest mb-3">How NIB Deductions Are Calculated</h4>
              <div className="space-y-3 text-[12px] text-foreground-light">
                <div className="flex items-start gap-2">
                  <span className="bg-surface-300 text-brand border border-strong rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] tabular-nums font-medium">1</span>
                  <p className="pt-0.5">Calculate gross wages for the pay period (regular hours × rate + overtime hours × OT rate)</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-surface-300 text-brand border border-strong rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] tabular-nums font-medium">2</span>
                  <p className="pt-0.5">Cap weekly wages at $550 for NIB calculation purposes</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-surface-300 text-brand border border-strong rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] tabular-nums font-medium">3</span>
                  <p className="pt-0.5">Employee deduction: Capped wages × 4.65% (deducted from paycheck)</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-surface-300 text-brand border border-strong rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] tabular-nums font-medium">4</span>
                  <p className="pt-0.5">Employer contribution: Capped wages × 6.65% (company expense, not deducted)</p>
                </div>
              </div>
            </div>

            <div className="border-b border-border" />

            <div className="bg-warning-subtle border border-warning-border rounded-lg p-4 flex gap-3">
              <Info className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-warning">
                <p className="font-semibold text-warning mb-0.5">Per-Worker NIB Settings</p>
                <p>NIB deductions can be enabled or disabled for individual workers in their profile. Go to Crew → Edit Worker to manage NIB settings and enter their NIB number.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-2xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">Notification Preferences</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Choose what notifications you want to receive</p>
            </div>

            <div className="space-y-2">
              {[
                { key: "low_stock_alerts", label: "Low Stock Alerts", desc: "Get notified when materials fall below minimum levels" },
                { key: "milestone_reminders", label: "Milestone Reminders", desc: "Reminders for upcoming project milestones" },
                { key: "payroll_reminders", label: "Payroll Reminders", desc: "Notifications for pay period deadlines" },
                { key: "budget_alerts", label: "Budget Alerts", desc: "Warnings when projects approach budget limits" },
                { key: "invoice_overdue_alerts", label: "Invoice Overdue Alerts", desc: "Get notified when invoices become overdue" },
                { key: "estimate_expiring_alerts", label: "Estimate Expiring Alerts", desc: "Reminders when estimates are about to expire" },
                { key: "team_notifications", label: "Team Notifications", desc: "Updates about team invitations and changes" },
                { key: "payment_notifications", label: "Payment Notifications", desc: "Alerts when payments are received" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-[13px] text-foreground">{item.label}</p>
                    <p className="text-[11px] text-foreground-lighter">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationPrefs[item.key as keyof typeof notificationPrefs]}
                    onChange={(e) =>
                      setNotificationPrefs({
                        ...notificationPrefs,
                        [item.key]: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded-md bg-surface-100 border-strong text-brand focus:ring-0 focus:ring-offset-0"
                  />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                onClick={handleNotificationPrefsUpdate}
                disabled={notificationLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
              >
                {notificationLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                Save Preferences
              </button>
            </div>
          </div>
        )}

        {activeTab === "ai" && (
          <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-6 max-w-2xl">
            <div>
              <h2 className="text-[14px] font-semibold text-foreground uppercase tracking-wider font-mono">AI Features</h2>
              <p className="text-[11px] text-foreground-lighter mt-1">Configure AI-powered search and content generation</p>
            </div>

            {/* Health and spend first. Preferences below matter only if the
                thing is actually answering, and for six days it was not. */}
            <AiStatusPanel />

            <div className="border-b border-border" />

            <div className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <label htmlFor="ai_tone" className="text-[10px] font-mono text-foreground-lighter uppercase tracking-widest block">Default Writing Tone</label>
                <Select
                  value={aiPreferences.tone}
                  onValueChange={(value: AITone) =>
                    setAiPreferences({ ...aiPreferences, tone: value })
                  }
                >
                  <SelectTrigger id="ai_tone" className="h-8 bg-surface-100 border-strong text-foreground-light text-[13px] focus:ring-0 focus:border-strong">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-surface-100 border-strong">
                    <SelectItem value="professional" className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                      Professional - Formal business language
                    </SelectItem>
                    <SelectItem value="concise" className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                      Concise - Brief and to-the-point
                    </SelectItem>
                    <SelectItem value="detailed" className="text-foreground-light focus:bg-surface-100 focus:text-foreground">
                      Detailed - Comprehensive with technical details
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-foreground-lighter tabular-nums mt-1">
                  This affects how AI generates descriptions for estimates, invoices, and other content
                </p>
              </div>

              <div className="border-b border-border" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[13px] text-foreground">Smart Search History</p>
                    <p className="text-[11px] text-foreground-lighter">
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
                    className="h-4 w-4 rounded-md bg-surface-100 border-strong text-brand focus:ring-0 focus:ring-offset-0"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[13px] text-foreground">Auto-Draft Descriptions</p>
                    <p className="text-[11px] text-foreground-lighter">
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
                    className="h-4 w-4 rounded-md bg-surface-100 border-strong text-brand focus:ring-0 focus:ring-offset-0"
                  />
                </div>
              </div>

              <div className="border-b border-border" />

              <div className="bg-background border border-border rounded-lg p-4 space-y-1">
                <p className="text-[11px] font-mono text-foreground-lighter uppercase tracking-wider">Usage Limits</p>
                <div className="text-[12px] text-foreground-light space-y-0.5 pt-1">
                  <p>Smart searches: 50 per day</p>
                  <p>Content generations: 100 per day</p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleAiPreferencesUpdate}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-surface-300 border border-strong text-[12px] font-medium text-brand hover:bg-surface-400 transition-colors disabled:opacity-40"
                >
                  {aiLoading && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                  Save AI Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
