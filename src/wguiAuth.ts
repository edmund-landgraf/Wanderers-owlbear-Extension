import { createClient, type AuthChangeEvent, type SupabaseClient } from "@supabase/supabase-js";

export type WguiTarget = "local" | "prod";

const TARGET_KEY = "wanderers-owlbear-wgui-target";

const localAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3NzgwODAwLCJleHAiOjE5MzU1NDcyMDB9.vp6J2oNVQgHMzZG6B6iuTTb_gFPD7jzTyVoxiw0nhf0";
const prodAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2NDkyNTU1LCJleHAiOjIxMDE4NTI1NTV9.bhMpateR8zqIG6T5uW_zA5W3GVPh4Lj1I0jHTqafaEo";

const targets: Record<WguiTarget, { appUrl: string; supabaseUrl: string; supabaseKey: string }> = {
  local: {
    // 5194 is the reskin. 5193 is the original UI on the same machine. Kong is the shared WG API.
    appUrl: "http://localhost:5194",
    supabaseUrl: "http://localhost:8000",
    supabaseKey: localAnonKey
  },
  prod: {
    // amba.wandersguide.site is the original UI. wgui.wandersguide.site is the reskin.
    // Both hosts are the same machine and the same WG instance. The popup opens the reskin.
    appUrl: "https://wgui.wandersguide.site",
    supabaseUrl: "https://amba.wandersguide.site",
    supabaseKey: prodAnonKey
  }
};

const targetListeners = new Set<(target: WguiTarget) => void>();

function defaultTarget(): WguiTarget {
  const fromEnv = import.meta.env.VITE_WGUI_TARGET?.trim();
  if (fromEnv === "local" || fromEnv === "prod") return fromEnv;
  return import.meta.env.DEV ? "local" : "prod";
}

export function getWguiTarget(): WguiTarget {
  try {
    const stored = localStorage.getItem(TARGET_KEY);
    if (stored === "local" || stored === "prod") return stored;
  } catch {
    // Private mode falls through to the build default.
  }
  return defaultTarget();
}

export function setWguiTarget(target: WguiTarget): void {
  if (getWguiTarget() === target) return;
  try {
    localStorage.setItem(TARGET_KEY, target);
  } catch {
    // The in-memory client still follows the requested target for this page load.
  }
  client = null;
  clientTarget = null;
  targetListeners.forEach((listener) => listener(target));
}

export function subscribeToWguiTarget(onTarget: (target: WguiTarget) => void): () => void {
  targetListeners.add(onTarget);
  return () => targetListeners.delete(onTarget);
}

export function wguiTargetProfile(target = getWguiTarget()) {
  return targets[target];
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
let clientTarget: WguiTarget | null = null;
const sessionListeners = new Set<(session: WguiSession | null, event: AuthChangeEvent) => void>();

function sessionStorageKey(target = getWguiTarget()) {
  return `wanderers-owlbear-wgui-session-${target}`;
}

function legacyAuthStorageKey(target = getWguiTarget()) {
  return `wanderers-owlbear-wgui-auth-${target}`;
}

/** Drop a previously copied GoTrue session so this page cannot refresh the site's token. */
function discardCopiedSupabaseSession(target = getWguiTarget()) {
  try {
    localStorage.removeItem(legacyAuthStorageKey(target));
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

function readStoredSession(target = getWguiTarget()): WguiSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(target));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: unknown };
    if (typeof parsed.accessToken !== "string") return null;
    const session = sessionFromAccessToken(parsed.accessToken);
    if (!session) localStorage.removeItem(sessionStorageKey(target));
    return session;
  } catch {
    return null;
  }
}

function writeStoredSession(session: WguiSession) {
  localStorage.setItem(sessionStorageKey(), JSON.stringify({ accessToken: session.accessToken }));
  sessionListeners.forEach((listener) => listener(session, "SIGNED_IN"));
}

function clearStoredSession() {
  try {
    localStorage.removeItem(sessionStorageKey());
  } catch {
    // Private mode only had the in-memory copy.
  }
  discardCopiedSupabaseSession();
  sessionListeners.forEach((listener) => listener(null, "SIGNED_OUT"));
}

function getSupabase(): SupabaseClient | null {
  if (!isWguiBackendConfigured()) return null;
  const target = getWguiTarget();
  if (client && clientTarget === target) return client;

  discardCopiedSupabaseSession(target);
  const profile = wguiTargetProfile(target);
  clientTarget = target;
  client = createClient(profile.supabaseUrl, profile.supabaseKey, {
    auth: {
      storageKey: legacyAuthStorageKey(target),
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

export function isTrustedWguiAuthOrigin(origin: string): boolean {
  return origin === wguiAuthOrigin();
}

/**
 * Open the small handoff page. It reads the session already stored on that origin
 * and posts the access token back. It must not be the full Wanderer's Guide app.
 */
export function startWguiAuth(): void {
  const url = new URL("/owlbear/auth/index.html", wguiTargetProfile().appUrl);
  url.searchParams.set("targetOrigin", window.location.origin);
  window.open(url.href, "wgui-owlbear-auth", "popup,width=520,height=420");
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

  discardCopiedSupabaseSession();
  writeStoredSession(session);
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
