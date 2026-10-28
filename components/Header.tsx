import { auth } from "@/auth";
import { initials } from "@/lib/session";
import { AppNav } from "./AppNav";
import { UserMenu } from "./UserMenu";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  return (
    <AppNav
      isAdmin={user.role === "ADMIN"}
      right={
        <UserMenu
          name={user.name ?? user.email ?? "Пользователь"}
          role={user.role}
          ini={initials(user.name ?? user.email ?? "?")}
        />
      }
    />
  );
}
