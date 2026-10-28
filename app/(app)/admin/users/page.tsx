import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { InviteButton, UserActions } from "./UserModals";

const STATUS: Record<string, { label: string; cls: string }> = {
  INVITED: { label: "приглашён", cls: "wait" },
  ACTIVE: { label: "активен", cls: "ok" },
  DISABLED: { label: "отключён", cls: "mut" },
};
const ROLE: Record<string, string> = { ADMIN: "Администратор", USER: "Пользователь" };

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export default async function AdminUsersPage() {
  const me = await requireAdmin();

  // #N is the position by creation date; the newest is shown first
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const rows: ListRow[] = users
    .map((u, i) => {
      const st = STATUS[u.status] ?? { label: u.status, cls: "mut" };
      return {
        key: u.id,
        search: `${u.name} ${u.email}`,
        facets: { role: ROLE[u.role], status: st.label },
        cells: [
          <span key="id" className="muted">#{i + 1}</span>,
          <div key="u"><div className="b">{u.name}</div><div className="sub">{u.email}</div></div>,
          ROLE[u.role],
          <span key="st" className={`st ${st.cls}`}>{st.label}</span>,
          <span key="d" className="muted">{fmt(u.createdAt)}</span>,
          <UserActions key="a" user={{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, isSelf: u.id === me.id }} />,
        ],
      };
    })
    .reverse();

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Пользователи</h1>
          <p className="lead">Заводите аккаунты и отправляйте приглашения по почте</p>
        </div>
        <InviteButton />
      </div>

      <ListTable
        columns={["ID", "Пользователь", "Роль", "Статус", "Создан", ""]}
        rows={rows}
        minWidth={680}
        searchPlaceholder="Поиск по имени или e-mail…"
        filters={[
          { id: "role", label: "Роль", options: Object.values(ROLE) },
          { id: "status", label: "Статус", options: Object.values(STATUS).map((s) => s.label) },
        ]}
      />
    </div>
  );
}
