import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { CreateUserForm } from "./CreateUserForm";
import { resendInvite } from "../actions";

const STATUS: Record<string, { label: string; cls: string }> = {
  INVITED: { label: "приглашён", cls: "wait" },
  ACTIVE: { label: "активен", cls: "ok" },
  DISABLED: { label: "отключён", cls: "mut" },
};

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export default async function AdminUsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Пользователи</h1>
          <p className="lead">Заводите аккаунты и отправляйте приглашения по почте</p>
        </div>
      </div>

      <CreateUserForm />

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Создан</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const st = STATUS[u.status] ?? { label: u.status, cls: "mut" };
              return (
                <tr key={u.id}>
                  <td>
                    <div className="b" style={{ fontWeight: 600 }}>{u.name}</div>
                    <div className="sub">{u.email}</div>
                  </td>
                  <td>{u.role === "ADMIN" ? "Администратор" : "Пользователь"}</td>
                  <td><span className={`st ${st.cls}`}>{st.label}</span></td>
                  <td className="muted">{fmt(u.createdAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    {u.status === "INVITED" && (
                      <form action={resendInvite}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button className="btn ghost sm" type="submit">
                          Выслать снова
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
