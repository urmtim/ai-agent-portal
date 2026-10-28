import Link from "next/link";
import { auth } from "@/auth";
import { initials } from "@/lib/session";
import { NavLink } from "./NavLink";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";

  return (
    <header className="hd">
      <div className="hdin">
        <Link href="/" className="brand">
          <span className="logo">С</span>
          Семейный&nbsp;портал
        </Link>

        <nav className="menu">
          <NavLink href="/">Обучение</NavLink>
          <NavLink href="/stats">Траты</NavLink>
          <NavLink href="/agents">Агенты</NavLink>
          <NavLink href="/me">Прогресс</NavLink>
          {isAdmin && <NavLink href="/admin/users">Люди</NavLink>}
          {isAdmin && <NavLink href="/admin/access">Доступы</NavLink>}
        </nav>

        <div className="right">
          <UserMenu
            name={user.name ?? user.email ?? "Пользователь"}
            role={user.role}
            ini={initials(user.name ?? user.email ?? "?")}
          />
        </div>
      </div>
    </header>
  );
}
