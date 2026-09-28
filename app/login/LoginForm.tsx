"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthActionState } from "@/lib/auth/actions";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState);

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;
  const action = isLogin ? loginAction : signupAction;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex rounded-full border border-border bg-surface p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          onClick={() => setMode("login")}
          className={`flex-1 rounded-full py-3 text-sm font-semibold transition-colors ${
            isLogin ? "bg-accent text-accent-foreground" : "text-muted"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          onClick={() => setMode("signup")}
          className={`flex-1 rounded-full py-3 text-sm font-semibold transition-colors ${
            !isLogin ? "bg-accent text-accent-foreground" : "text-muted"
          }`}
        >
          Sign up
        </button>
      </div>

      <form key={mode} action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 6}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-foreground outline-none focus:border-accent"
          />
        </label>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-2xl bg-accent py-4 text-base font-semibold text-accent-foreground disabled:opacity-60"
        >
          {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
