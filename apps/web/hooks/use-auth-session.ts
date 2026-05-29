"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
};

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null
  });

  useEffect(() => {
    const client = getSupabaseBrowserClient();

    client.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setState({
        loading: false,
        session: data.session,
        user: data.session?.user ?? null
      });
    });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setState({
        loading: false,
        session,
        user: session?.user ?? null
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
