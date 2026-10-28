// Rules that keep the portal from losing its last administrator. Pure, see user-guard.test.ts.

export type GuardUser = { id: string; role: "ADMIN" | "USER"; status: "INVITED" | "ACTIVE" | "DISABLED" };

export type UserChange =
  | { kind: "delete" }
  | { kind: "update"; role: "ADMIN" | "USER"; canLogin: boolean };

/** Error text if the change is not allowed, otherwise null. activeAdminCount counts ACTIVE admins incl. target. */
export function checkUserChange(opts: {
  actorId: string;
  target: GuardUser;
  change: UserChange;
  activeAdminCount: number;
}): string | null {
  const { actorId, target, change, activeAdminCount } = opts;
  const self = target.id === actorId;

  if (change.kind === "delete") {
    if (self) return "Нельзя удалить самого себя";
  } else {
    if (self && !change.canLogin) return "Нельзя отключить самого себя";
    if (self && change.role !== "ADMIN") return "Нельзя снять роль администратора с самого себя";
  }

  const isLastAdmin = target.role === "ADMIN" && target.status === "ACTIVE" && activeAdminCount <= 1;
  const losesAdmin = change.kind === "delete" || change.role !== "ADMIN" || !change.canLogin;
  if (isLastAdmin && losesAdmin) return "Нельзя убрать последнего администратора";

  return null;
}

/** Status after toggling "Может входить": back to INVITED while no password is set. */
export function statusFor(canLogin: boolean, hasPassword: boolean): GuardUser["status"] {
  if (!canLogin) return "DISABLED";
  return hasPassword ? "ACTIVE" : "INVITED";
}
