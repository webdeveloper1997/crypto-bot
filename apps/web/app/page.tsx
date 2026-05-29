"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/hooks/use-auth-session";

export default function HomePage() {
  const router = useRouter();
  const { loading, user } = useAuthSession();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [loading, router, user]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="glass-panel max-w-2xl rounded-[2rem] p-10 text-center">
        <p className="mono text-xs uppercase tracking-[0.34em] text-[var(--color-muted)]">Crypto bot control room</p>
        <h1 className="mt-4 text-5xl font-semibold leading-tight text-[var(--color-ink)]">
          Redirecting into the paper-versus-live dashboard.
        </h1>
      </section>
    </main>
  );
}

