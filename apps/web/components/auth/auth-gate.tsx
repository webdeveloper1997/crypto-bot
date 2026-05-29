"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/hooks/use-auth-session";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, user } = useAuthSession();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel max-w-md rounded-[2rem] p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">Booting dashboard</p>
          <h1 className="mt-4 text-2xl font-semibold text-[var(--color-ink)]">Checking your Supabase session</h1>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

