"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { findValidInvite } from "@/lib/invites";

export type InviteState = { error?: string } | undefined;

const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Пароли не совпадают",
    path: ["confirm"],
  });

export async function setPassword(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  }

  const invite = await findValidInvite(parsed.data.token);
  if (!invite) {
    return { error: "Ссылка недействительна или устарела. Попросите админа выслать новое приглашение." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: invite.userId },
      data: { passwordHash, status: "ACTIVE" },
    }),
    prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?welcome=1");
}
