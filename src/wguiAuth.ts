import { createClient, type AuthChangeEvent, type SupabaseClient } from "@supabase/supabase-js";

const localAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3NzgwODAwLCJleHAiOjE5MzU1NDcyMDB9.vp6J2oNVQgHMzZG6B6iuTTb_gFPD7jzTyVoxiw0nhf0";
const prodAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2NDkyNTU1LCJleHAiOjIxMDE4NTI1NTV9.bhMpateR8zqIG6T5uW_zA5W3GVPh4Lj1I0jHTqafaEo";

type WguiBackend = "local" | "prod";

const profiles: Record<WguiBackend, { appUrl: string; supabaseUrl: string; supabaseKey: string }> = {
  local: {
    appUrl: "http://localhost:5194",
    supabaseUrl: "http://localhost:8000",
    supabaseKey: localAnonKey
  },
  prod: {
    appUrl: "https://wgui.wandersguide.site",
    supabaseUrl: "https://amba.wandersguide.site",
    supabaseKey: prodAnonKey
  }
};

export function wguiBackendForExtensionHost(hostname: string): WguiBackend {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized.endsWith(".localhost")
    ? "local"
    : "prod";
}

function initialBackend(): WguiBackend {
  if (typeof window === "undefined") return "local";
  return wguiBackendForExtensionHost(window.location.hostname);
}

let activeBackend: WguiBackend = initialBackend();

export function wguiTargetProfile(backend: WguiBackend = activeBackend) {
  return profiles[backend];
}

/** Handoff page for a backend. The popup reads the session stored on that origin. */
export function wguiAuthUrl(backend: WguiBackend = activeBackend, targetOrigin?: string): URL {
  const url = new URL("/owlbear/auth", wguiTargetProfile(backend).appUrl);
  if (targetOrigin) url.searchParams.set("targetOrigin", targetOrigin);
  return url;
}

export type WguiSession = {
  accessToken: string;
  userId: string;
  email?: string | null;
};

export function isWguiBackendConfigured(): boolean {
  if (import.meta.env.VITE_SUPABASE_URL === "" || import.meta.env.VITE_SUPABASE_KEY === "") {
    return false;
  }
  const profile = wguiTargetProfile();
  return Boolean(profile.supabaseUrl && profile.supabaseKey);
}

let client: SupabaseClient | null = null;
let clientBackend: WguiBackend | null = null;
const sessionListeners = new Set<(session: WguiSession | null, event: AuthChangeEvent) => void>();

const SESSION_KEY = "wanderers-owlbear-wgui-session-local";
const LEGACY_AUTH_KEY = "wanderers-owlbear-wgui-auth-local";

/** Drop a previously copied GoTrue session so this page cannot refresh the site's token. */
function discardCopiedSupabaseSession() {
  try {
    localStorage.removeItem(LEGACY_AUTH_KEY);
  } catch {
    // Private mode has nothing stored to discard.
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sessionFromAccessToken(accessToken: string): WguiSession | null {
  const payload = decodeJwtPayload(accessToken);
  const userId = typeof payload?.sub === "string" ? payload.sub : "";
  const exp = typeof payload?.exp === "number" ? payload.exp : 0;
  if (!userId || exp * 1000 <= Date.now()) return null;
  return {
    accessToken,
    userId,
    email: typeof payload?.email === "string" ? payload.email : null
  };
}

function readStoredSession(): WguiSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: unknown; backend?: unknown };
    if (typeof parsed.accessToken !== "string") return null;
    if (parsed.backend === "prod" || parsed.backend === "local") {
      if (clientBackend !== parsed.backend) client = null;
      activeBackend = parsed.backend;
    }
    const session = sessionFromAccessToken(parsed.accessToken);
    if (!session) localStorage.removeItem(SESSION_KEY);
    return session;
  } catch {
    return null;
  }
}

function writeStoredSession(session: WguiSession, backend: WguiBackend) {
  activeBackend = backend;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: session.accessToken, backend }));
  sessionListeners.forEach((listener) => listener(session, "SIGNED_IN"));
}

function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode only had the in-memory copy.
  }
  discardCopiedSupabaseSession();
  sessionListeners.forEach((listener) => listener(null, "SIGNED_OUT"));
}

function getSupabase(): SupabaseClient | null {
  if (!isWguiBackendConfigured()) return null;
  if (client) return client;

  discardCopiedSupabaseSession();
  const profile = wguiTargetProfile();
  clientBackend = activeBackend;
  client = createClient(profile.supabaseUrl, profile.supabaseKey, {
    auth: {
      storageKey: LEGACY_AUTH_KEY,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: async (_name, _timeout, fn) => await fn()
    }
  });
  return client;
}

export async function getWguiSession(): Promise<WguiSession | null> {
  if (!isWguiBackendConfigured()) return null;
  return readStoredSession();
}

export function subscribeToWguiSession(
  onSession: (session: WguiSession | null, event: AuthChangeEvent) => void
): () => void {
  sessionListeners.add(onSession);
  return () => sessionListeners.delete(onSession);
}

export const WGUI_AUTH_MESSAGE = "wgui-owlbear-auth";

export function wguiAuthOrigin(): string {
  return new URL(wguiTargetProfile().appUrl).origin;
}

/** Production signs in here. Localhost still hands off an existing site session. */
export function wguiUsesHostedLogin(): boolean {
  return activeBackend === "prod";
}

export async function signInWguiWithPassword(email: string, password: string): Promise<WguiSession> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("WGUI backend is not configured.");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw new Error(error.message);

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Sign in did not return a session.");

  const session = sessionFromAccessToken(accessToken);
  if (!session) throw new Error("Wanderer's Guide session expired. Sign in again.");

  discardCopiedSupabaseSession();
  writeStoredSession(session, activeBackend);
  return session;
}

/** Opens Google in a popup. The Wanderer's Guide handoff page posts the session back. */
export async function startWguiGoogleSignIn(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("WGUI backend is not configured.");

  const redirectTo = wguiAuthUrl(activeBackend, window.location.origin).href;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" }
    }
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("Google sign-in did not return a URL.");

  const timestamp = String(Date.now());
  window.open(data.url, `wgui-owlbear-auth-${timestamp}`, "popup,width=520,height=640");
}

export function isTrustedWguiAuthOrigin(origin: string): boolean {
  return origin === profiles.local.appUrl || origin === profiles.prod.appUrl;
}

function backendForOrigin(origin: string): WguiBackend | null {
  if (origin === profiles.prod.appUrl) return "prod";
  if (origin === profiles.local.appUrl) return "local";
  return null;
}

/**
 * Open the small handoff page. It reads the session already stored on that origin
 * and posts the access token back. It must not be the full Wanderer's Guide app.
 */
export function startWguiAuth(): void {
  const url = wguiAuthUrl(activeBackend, window.location.origin);
  const timestamp = String(Date.now());
  url.searchParams.set("cacheBust", timestamp);
  window.open(url.href, `wgui-owlbear-auth-${timestamp}`, "popup,width=520,height=420");
}

export async function acceptWguiAuthMessage(
  event: MessageEvent
): Promise<WguiSession | null> {
  if (!isWguiBackendConfigured()) return null;
  if (!isTrustedWguiAuthOrigin(event.origin)) return null;
  if (event.data?.type !== WGUI_AUTH_MESSAGE) return null;

  const accessToken = event.data.accessToken;
  if (typeof accessToken !== "string" || !accessToken) return null;

  const session = sessionFromAccessToken(accessToken);
  if (!session) {
    throw new Error("Wanderer's Guide session expired. Log in on the site, then connect again.");
  }

  const backend = backendForOrigin(event.origin);
  if (!backend) return null;

  discardCopiedSupabaseSession();
  if (clientBackend !== backend) client = null;
  writeStoredSession(session, backend);
  return session;
}

export async function signOutOfWgui(): Promise<void> {
  clearStoredSession();
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
  const supabase = getSupabase();
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
