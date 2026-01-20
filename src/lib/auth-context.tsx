"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { User as Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        setProfile(null);
      } else {
        setProfile(data as Profile | null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:52',message:'useEffect started',data:{mounted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const getSession = async () => {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:55',message:'getSession called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:57',message:'getSession result',data:{hasError:!!error,errorMessage:error?.message,hasSession:!!session,hasUser:!!session?.user,userId:session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (error) {
          console.error("Error getting session:", error);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:60',message:'getSession error path',data:{error:error.message,mounted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          if (mounted) {
            setLoading(false);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:62',message:'setLoading false on error',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
          }
          return;
        }

        if (mounted) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:67',message:'Setting session and user',data:{hasSession:!!session,hasUser:!!session?.user},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false); // Set loading to false immediately after getting session
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:70',message:'setLoading false after session',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
        }

        // Fetch profile in the background (non-blocking)
        if (session?.user) {
          fetchProfile(session.user.id).catch((err) => {
            console.error("Background profile fetch failed:", err);
          });
        }
      } catch (error) {
        console.error("Error in getSession:", error);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:79',message:'getSession catch block',data:{errorMessage:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (mounted) {
          setLoading(false);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/219dfdb1-3353-46ca-9c1b-4d9e8cfab01b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth-context.tsx:82',message:'setLoading false in catch',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
        }
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          if (mounted) {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false); // Set loading to false immediately
          }

          // Fetch profile in the background (non-blocking)
          if (session?.user) {
            fetchProfile(session.user.id).catch((err) => {
              console.error("Background profile fetch failed:", err);
            });
          } else {
            if (mounted) {
              setProfile(null);
            }
          }
        } catch (error) {
          console.error("Error in auth state change:", error);
          if (mounted) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
