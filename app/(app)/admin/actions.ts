"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { createInvite, inviteLink } from "@/lib/invites";
import { sendMail, inviteEmail } from "@/lib/mail";

const createSchema = z.object({
  name: z.string().min(1, "Укажите имя"),
  email: z.string().email("Неверный email"),
  role: z.enum(["USER", "ADMIN"]),
});

export type CreateUserState = { error?: string; ok?: string; link?: string } | undefined;

/** Create a user (status INVITED) and send an invite link by email. */
export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Пользователь с таким email уже есть" };
  }

  const user = await prisma.user.create({
    data: { name: parsed.data.name.trim(), email, role: parsed.data.role, status: "INVITED" },
  });

  const raw = await createInvite(user.id);
  const link = inviteLink(raw);
  await sendMail({ to: email, ...inviteEmail(user.name, link) });

  revalidatePath("/admin/users");
  return { ok: `Пользователь создан, приглашение отправлено на ${email}.`, link };
}

/** Issue a fresh invite link for a user who hasn't activated yet. */
export async function resendInvite(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId"));
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const raw = await createInvite(user.id);
  const link = inviteLink(raw);
  await sendMail({ to: user.email, ...inviteEmail(user.name, link) });

  revalidatePath("/admin/users");
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
