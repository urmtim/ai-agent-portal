"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createInvite, inviteLink } from "@/lib/invites";
import { sendMail, inviteEmail, mailIsConsole } from "@/lib/mail";
import { checkUserChange, statusFor } from "@/lib/user-guard";

/** Result of a form action shown in a modal: error keeps it open, ok closes it with a toast. */
export type FormState = { error?: string; ok?: string; link?: string } | undefined;

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Неверный email"),
  firstName: z.string().trim().max(60),
  lastName: z.string().trim().max(60),
  role: z.enum(["USER", "ADMIN"]),
});

/** Invite link is handed back to the browser only when mail is not really delivered (dev). */
async function sendInvite(user: { id: string; name: string; email: string }) {
  const link = inviteLink(await createInvite(user.id));
  await sendMail({ to: user.email, ...inviteEmail(user.name, link) });
  return mailIsConsole() ? link : undefined;
}

/** Create a user (status INVITED) and send an invite link by email. */
export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    email: formData.get("email") ?? "",
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };

  const { email, firstName, lastName, role } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "Пользователь с таким email уже есть" };
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
  const user = await prisma.user.create({ data: { name, email, role, status: "INVITED" } });
  const link = await sendInvite(user);

  revalidatePath("/admin/users");
  return { ok: "Приглашение отправлено", link };
}

/** Issue a fresh invite link for a user who hasn't activated yet. */
export async function resendInvite(userId: string): Promise<FormState> {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "INVITED") return { error: "Пользователь не ждёт приглашения" };

  const link = await sendInvite(user);
  revalidatePath("/admin/users");
  return { ok: "Приглашение отправлено повторно", link };
}

async function guard(actorId: string, userId: string, change: Parameters<typeof checkUserChange>[0]["change"]) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "Пользователь не найден" as const };
  const activeAdminCount = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
  const error = checkUserChange({ actorId, target, change, activeAdminCount });
  return error ? { error } : { target };
}

const updateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Укажите имя").max(120),
  role: z.enum(["USER", "ADMIN"]),
});

/** Change name, role and whether the user may sign in. */
export async function updateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };

  const { userId, name, role } = parsed.data;
  const canLogin = formData.get("canLogin") === "on";
  const g = await guard(admin.id, userId, { kind: "update", role, canLogin });
  if ("error" in g) return { error: g.error };

  await prisma.user.update({
    where: { id: userId },
    data: { name, role, status: statusFor(canLogin, !!g.target.passwordHash) },
  });
  revalidatePath("/admin/users");
  return { ok: "Сохранено" };
}

/** Delete a user with everything they own (agents, receipts, progress, access). */
export async function deleteUser(userId: string): Promise<FormState> {
  const admin = await requireAdmin();
  const g = await guard(admin.id, userId, { kind: "delete" });
  if ("error" in g) return { error: g.error };

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
  revalidatePath("/admin/access");
  return { ok: "Пользователь удалён" };
}

/** Grant or revoke a course for a user (toggle). */
export async function toggleAccess(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const courseSlug = String(formData.get("courseSlug"));
  const grant = formData.get("grant") === "1";

  if (grant) {
    await prisma.courseAccess.upsert({
      where: { userId_courseSlug: { userId, courseSlug } },
      update: {},
      create: { userId, courseSlug, grantedBy: admin.id },
    });
  } else {
    await prisma.courseAccess.deleteMany({ where: { userId, courseSlug } });
  }

  revalidatePath("/admin/access");
}
