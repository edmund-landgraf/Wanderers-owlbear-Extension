import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY?.trim();

export type WguiSession = {
  accessToken: string;
  userId: string;
  email?: string | null;
};

export function isWguiBackendConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

const supabase = isWguiBackendConfigured()
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        storageKey: "wanderers-owlbear-wgui-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: async (_name, _timeout, fn) => await fn()
      }
    })
  : null;

function toSession(session: Session | null): WguiSession | null {
  if (!session?.access_token || !session.user?.id) return null;
  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email
  };
}

export async function getWguiSession(): Promise<WguiSession | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return toSession(data.session);
}

export function subscribeToWguiSession(
  onSession: (session: WguiSession | null) => void
): () => void {
  if (!supabase) return () => {};

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((_event, session) => {
    onSession(toSession(session));
  });

  return () => subscription.unsubscribe();
}

export async function signInToWgui(
  email: string,
  password: string
): Promise<{ session: WguiSession | null; error: string | null }> {
  if (!supabase) {
    return {
      session: null,
      error: "WGUI backend is not configured for this extension."
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      session: null,
      error: error.code === "invalid_credentials"
        ? "Invalid email or password."
        : error.message
    };
  }

  return {
    session: toSession(data.session),
    error: null
  };
}

export async function signOutOfWgui(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: "local" });
}

type ApiEnvelope<T> = {
  status: "success" | "fail" | "error";
  data?: T;
  message?: string;
};

export async function invokeWguiFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  if (!supabase) {
    throw new Error("WGUI backend is not configured.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (error) {
    let detail = error.message || `Request to ${functionName} failed`;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json();
        detail = payload?.message || payload?.data?.message || detail;
      } catch {
        // Preserve the Supabase SDK error when the response is not JSON.
      }
    }
    throw new Error(`${functionName}: ${detail}`);
  }

  const envelope = data as ApiEnvelope<T> | null;
  if (!envelope) {
    throw new Error(`${functionName}: empty response`);
  }

  if (envelope.status !== "success") {
    throw new Error(`${functionName}: ${envelope.message || "request failed"}`);
  }

  return envelope.data as T;
}
