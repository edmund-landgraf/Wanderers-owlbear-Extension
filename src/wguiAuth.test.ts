// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

const user = {
  id: "user-1",
  email: "gm@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {}
};

function accessToken(exp = Math.floor(Date.now() / 1000) + 3600) {
  return jwt({ sub: user.id, email: user.email, role: "authenticated", exp });
}

function authMessage(origin: string, access = accessToken(), refresh = "refresh-token") {
  return {
    origin,
    data: {
      type: "wgui-owlbear-auth",
      accessToken: access,
      refreshToken: refresh
    }
  } as MessageEvent;
}

async function loadAuth() {
  vi.resetModules();
  return import("./wguiAuth");
}

describe("WGUI auth session handoff", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reports no session when storage is empty", async () => {
    const { getWguiSession } = await loadAuth();
    await expect(getWguiSession()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores messages that are not from the active Wanderer's Guide origin", async () => {
    const { acceptWguiAuthMessage, getWguiTarget, wguiAuthOrigin } = await loadAuth();
    expect(getWguiTarget()).toBe("local");
    expect(wguiAuthOrigin()).toBe("http://localhost:5194");

    await expect(
      acceptWguiAuthMessage(authMessage("https://evil.example"))
    ).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores messages that are missing tokens", async () => {
    const { acceptWguiAuthMessage } = await loadAuth();
    const event = {
      origin: "http://localhost:5194",
      data: { type: "wgui-owlbear-auth", refreshToken: "refresh-only" }
    } as MessageEvent;

    await expect(acceptWguiAuthMessage(event)).resolves.toBeNull();
  });

  it("rejects an access token that is not a session", async () => {
    const { acceptWguiAuthMessage } = await loadAuth();

    await expect(
      acceptWguiAuthMessage(authMessage("http://localhost:5194", "not-a-jwt", ""))
    ).rejects.toThrow("Wanderer's Guide session expired");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an expired access token without calling the auth server", async () => {
    const { acceptWguiAuthMessage } = await loadAuth();
    const expired = accessToken(Math.floor(Date.now() / 1000) - 60);

    await expect(
      acceptWguiAuthMessage(authMessage("http://localhost:5194", expired, "stale-refresh"))
    ).rejects.toThrow("Wanderer's Guide session expired");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stores a live session from a trusted auth popup and reads it back", async () => {
    const { acceptWguiAuthMessage, getWguiSession, subscribeToWguiSession } = await loadAuth();
    const seen: string[] = [];
    const stop = subscribeToWguiSession((_session, event) => {
      seen.push(event);
    });

    const session = await acceptWguiAuthMessage(authMessage("http://localhost:5194"));

    expect(session).toEqual({
      accessToken: expect.any(String),
      userId: "user-1",
      email: "gm@example.invalid"
    });
    await expect(getWguiSession()).resolves.toEqual(session);
    expect(seen).toContain("SIGNED_IN");
    expect(localStorage.getItem("wanderers-owlbear-wgui-session-local")).toContain(session?.accessToken);
    expect(localStorage.getItem("wanderers-owlbear-wgui-auth-local")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    stop();
  });

  it("calls a function with the extension bearer token and keeps a missing session off that request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ status: "success", data: [{ id: 23 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const { invokeWguiFunction } = await loadAuth();
    await expect(
      invokeWguiFunction("find-campaign", { user_id: "user-1" }, "extension-access-token")
    ).resolves.toEqual([{ id: 23 }]);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost:8000/functions/v1/find-campaign");
    expect(new Headers((init as RequestInit).headers).get("Authorization")).toBe(
      "Bearer extension-access-token"
    );
  });

  it("includes the function error body when the call fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: "Auth session missing!" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    );

    const { invokeWguiFunction } = await loadAuth();
    await expect(
      invokeWguiFunction("find-campaign", { user_id: "user-1" }, "extension-access-token")
    ).rejects.toThrow("find-campaign: Auth session missing!");
  });

  it("signs out locally and drops the stored session", async () => {
    const { acceptWguiAuthMessage, getWguiSession, signOutOfWgui } = await loadAuth();
    await acceptWguiAuthMessage(authMessage("http://localhost:5194"));
    await expect(getWguiSession()).resolves.toMatchObject({ userId: "user-1" });

    await signOutOfWgui();

    await expect(getWguiSession()).resolves.toBeNull();
    expect(localStorage.getItem("wanderers-owlbear-wgui-session-local")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens the handoff page instead of the Wanderer's Guide app", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { startWguiAuth } = await loadAuth();

    startWguiAuth();

    const opened = String(open.mock.calls[0]?.[0]);
    expect(opened).toContain("http://localhost:5194/owlbear/auth/index.html");
    expect(opened).toContain("targetOrigin=");
    expect(opened).not.toBe("http://localhost:5194/");
  });

  it("uses a separate auth store after switching to production", async () => {
    const { getWguiSession, setWguiTarget, wguiAuthOrigin } = await loadAuth();
    localStorage.setItem(
      "wanderers-owlbear-wgui-session-local",
      JSON.stringify({ accessToken: accessToken() })
    );

    setWguiTarget("prod");

    expect(wguiAuthOrigin()).toBe("https://wgui.wandersguide.site");
    await expect(getWguiSession()).resolves.toBeNull();
  });
});
