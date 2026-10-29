"use server";

import { auth, signOut } from "@/auth";
import { audit } from "@/lib/audit";

export async function logout() {
  const session = await auth();
  if (session?.user) await audit("logout", "Выход из системы", session.user);
  await signOut({ redirectTo: "/login" });
}
