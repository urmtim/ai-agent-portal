"use client";

import { useActionState } from "react";
import { authenticate } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(authenticate, undefined);

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="authhead">
          <div className="brand" style={{ justifyContent: "center", fontSize: 18 }}>
            <span className="logo">С</span>
            Семейный портал
          </div>
          <p className="lead" style={{ marginTop: 10 }}>
            Войдите, чтобы продолжить обучение
          </p>
        </div>

        <form action={action} className="card pad">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          {state?.error && (
            <div className="formerr" style={{ marginBottom: 14 }}>
              {state.error}
            </div>
          )}

          <button className="btn primary block" type="submit" disabled={pending}>
            {pending ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
