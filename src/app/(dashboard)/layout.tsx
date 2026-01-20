"use client";

import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  // #region agent log
  {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard/layout.tsx:7',message:'DashboardContent render',data:{loading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});return null})()}
  // #endregion

  if (loading) {
    // #region agent log
    {(()=>{fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard/layout.tsx:9',message:'Showing loading screen',data:{loading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});return null})()}
    // #endregion
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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
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
