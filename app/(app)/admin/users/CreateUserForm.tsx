"use client";

import { useActionState } from "react";
import { createUser, type CreateUserState } from "../actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(
    createUser,
    undefined,
  );

  return (
    <form action={action} className="card pad" style={{ marginBottom: 24 }}>
      <h2 className="title" style={{ fontSize: 16, marginBottom: 14 }}>
        Добавить пользователя
      </h2>

      <div className="grid cols3" style={{ gap: 14, marginBottom: 14 }}>
        <div>
          <label htmlFor="name">Имя</label>
          <input id="name" name="name" placeholder="Иван Петров" required />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" placeholder="ivan@company.com" required />
        </div>
        <div>
          <label htmlFor="role">Роль</label>
          <select id="role" name="role" defaultValue="USER">
            <option value="USER">Пользователь</option>
            <option value="ADMIN">Администратор</option>
          </select>
        </div>
      </div>

      {state?.error && <div className="formerr" style={{ marginBottom: 12 }}>{state.error}</div>}
      {state?.ok && (
        <div className="formok" style={{ marginBottom: 12 }}>
          {state.ok}
          {state.link && (
            <div style={{ marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12 }}>Ссылка-приглашение (dev):</span>
              <br />
              <code style={{ wordBreak: "break-all", fontSize: 12 }}>{state.link}</code>
            </div>
          )}
        </div>
      )}

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Создаём…" : "Создать и отправить приглашение"}
      </button>
    </form>
  );
}
