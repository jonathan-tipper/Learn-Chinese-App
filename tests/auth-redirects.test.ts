import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));

vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signUp } })
}));

function authActions() {
  const capture = vi.fn<(actions: ReturnType<typeof useAuth>) => void>();
  function ReadAuth() {
    capture(useAuth());
    return null;
  }
  renderToStaticMarkup(createElement(AuthProvider, null, createElement(ReadAuth)));
  return capture.mock.calls[0][0];
}

describe("email confirmation redirects", () => {
  beforeEach(() => {
    signUp.mockReset().mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    "https://learnchinese.jonathantipper.com",
    "http://localhost:3000"
  ])("returns confirmations to the current app at %s", async (origin) => {
    vi.stubGlobal("window", { location: { origin } });

    const error = await authActions().signUpWithPassword("learner@example.com", "test-password");

    expect(error).toBeNull();
    expect(signUp).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "test-password",
      options: { emailRedirectTo: `${origin}/login` }
    });
  });
});
