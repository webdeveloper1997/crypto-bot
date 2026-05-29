"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuthSession } from "@/hooks/use-auth-session";

export default function LoginPage() {
  const router = useRouter();
  const { user } = useAuthSession();
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);

    const result = isSignup
      ? await client.auth.signUp({ email, password })
      : await client.auth.signInWithPassword({ email, password });

    setSubmitting(false);

    if (result.error) {
      setStatus(result.error.message);
      return;
    }

    setStatus(isSignup ? "Account created. Check your email if confirmation is enabled." : "Signed in. Loading dashboard.");

    if (!isSignup) {
      router.replace("/dashboard");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="glass-panel rounded-[2.5rem] p-10 lg:p-14">
          <p className="mono text-xs uppercase tracking-[0.34em] text-[var(--color-muted)]">Binance spot operator console</p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight text-[var(--color-ink)]">
            Track predictions, real fills, fees, drawdowns, and the paper-to-live handoff from one place.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-muted)]">
            This dashboard talks to Supabase directly with the public anon key. It can request bot actions, but all trading
            credentials stay on your Oracle worker.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["Prediction ledger", "Every call stores expected move, realized return, fee drag, and hit rate."],
              ["Operator controls", "Start, stop, flatten, and request a mode switch without exposing exchange keys."],
              ["Risk feed", "Daily drawdown, fee pressure, and worker-side halts show up as first-class events."]
            ].map(([label, text]) => (
              <div key={label} className="rounded-[1.5rem] border border-white/70 bg-white/70 p-5">
                <p className="text-lg font-semibold text-[var(--color-ink)]">{label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[2.5rem] p-8 lg:p-10">
          <p className="mono text-xs uppercase tracking-[0.34em] text-[var(--color-muted)]">{isSignup ? "Create admin" : "Sign in"}</p>
          <h2 className="mt-4 text-3xl font-semibold text-[var(--color-ink)]">{isSignup ? "Seed the first operator" : "Resume the control room"}</h2>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-[var(--color-ink)] outline-none ring-0"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--color-ink)]">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-[var(--color-ink)] outline-none ring-0"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {submitting ? "Working..." : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setIsSignup((current) => !current)}
            className="mt-4 text-sm font-medium text-[var(--color-accent-strong)]"
          >
            {isSignup ? "Already have an account? Sign in" : "Create the first admin account"}
          </button>

          {status ? <p className="mt-5 rounded-2xl bg-white/70 px-4 py-3 text-sm text-[var(--color-muted)]">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}

