"use client";

import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/mobile/mobile-nav";
import { CreateCompanyDialog } from "@/components/layout/create-company-dialog";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading, profile, refreshProfile } = useAuth();
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [hasCheckedCompany, setHasCheckedCompany] = useState(false);
  
  // Check localStorage for dismissed preference
  const getDismissedPreference = (userId: string | undefined): boolean => {
    if (typeof window === 'undefined' || !userId) return false;
    try {
      const dismissed = localStorage.getItem(`company-dialog-dismissed-${userId}`);
      return dismissed === 'true';
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return false;
    }
  };

  const setDismissedPreference = (userId: string | undefined, dismissed: boolean) => {
    if (typeof window === 'undefined' || !userId) return;
    try {
      if (dismissed) {
        localStorage.setItem(`company-dialog-dismissed-${userId}`, 'true');
      } else {
        localStorage.removeItem(`company-dialog-dismissed-${userId}`);
      }
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  };

  // Check if user needs to create a company
  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) {
      return;
    }
    
    // Don't check if user has company
    if (profile?.company_id) {
      return;
    }
    
    // Check if user has dismissed the dialog before
    const hasDismissed = getDismissedPreference(profile?.id);
    if (hasDismissed) {
      return;
    }
    
    // Check if user exists but doesn't have a company
    if (profile && !profile.company_id && !hasCheckedCompany) {
      // Show dialog with a small delay to ensure page is loaded
      const timer = setTimeout(() => {
        console.log("Showing company creation dialog - profile:", {
          id: profile.id,
          email: profile.email,
          company_id: profile.company_id,
        });
        setShowCompanyDialog(true);
        setHasCheckedCompany(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, profile, hasCheckedCompany]);

  const handleCompanyCreated = () => {
    // Refresh profile to get updated company_id
    refreshProfile();
    setShowCompanyDialog(false);
    // Clear dismissed preference since they created a company
    if (profile?.id) {
      setDismissedPreference(profile.id, false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setShowCompanyDialog(open);
    if (!open && !profile?.company_id && profile?.id) {
      // User dismissed the dialog without creating a company - save to localStorage
      setDismissedPreference(profile.id, true);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto pb-safe md:pb-0">{children}</main>
        <MobileNav />
      </div>
      <CreateCompanyDialog
        open={showCompanyDialog}
        onOpenChange={handleDialogClose}
        onSuccess={handleCompanyCreated}
      />
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}
