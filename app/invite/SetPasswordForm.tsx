"use client";

import { useActionState } from "react";
import { setPassword } from "./actions";

export function SetPasswordForm({
  token,
  name,
  email,
}: {
  token: string;
  name: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(setPassword, undefined);

  return (
    <form action={action} className="card pad">
      <input type="hidden" name="token" value={token} />

      <p className="lead" style={{ marginBottom: 16 }}>
        {name}, задайте пароль для входа как <b>{email}</b>.
      </p>

      <div className="field">
        <label htmlFor="password">Новый пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Минимум 8 символов"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="confirm">Повторите пароль</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
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
        {pending ? "Сохраняем…" : "Активировать аккаунт"}
      </button>
    </form>
  );
}
