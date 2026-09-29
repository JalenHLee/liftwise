"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthActionState } from "@/lib/auth/actions";
import { ErrorText, Field, PrimaryButton } from "@/components/ui";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(signIn, initialState);
  const [signupState, signupAction, signupPending] = useActionState(signUp, initialState);

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;
  const action = isLogin ? loginAction : signupAction;

  const tabClass = (active: boolean) =>
    `min-h-11 text-base decoration-1 underline-offset-[10px] transition-colors ${
      active ? "text-ink underline" : "text-muted"
    }`;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <div className="flex gap-7" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isLogin}
          onClick={() => setMode("login")}
          className={tabClass(isLogin)}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isLogin}
          onClick={() => setMode("signup")}
          className={tabClass(!isLogin)}
        >
          Sign up
        </button>
      </div>

      <form key={mode} action={action} className="flex flex-col gap-7">
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={isLogin ? undefined : 6}
          autoComplete={isLogin ? "current-password" : "new-password"}
        />

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <PrimaryButton type="submit" disabled={pending} className="mt-3">
          {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </PrimaryButton>
      </form>
    </div>
  );
}
