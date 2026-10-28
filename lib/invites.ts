import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/db";

const INVITE_TTL_HOURS = 72;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Creates a fresh invite token for a user and returns the raw token
 * (the raw value is never stored — only its sha256 hash).
 */
export async function createInvite(userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);

  await prisma.inviteToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt },
  });

  return raw;
}

export function inviteLink(rawToken: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/invite?token=${rawToken}`;
}

/** Returns the pending invite (+ user) for a raw token, or null if invalid/expired/used. */
export async function findValidInvite(rawToken: string) {
  if (!rawToken) return null;
  const token = await prisma.inviteToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token || token.usedAt || token.expiresAt < new Date()) return null;
  return token;
}

/** Marks a token used (call inside the same flow that sets the password). */
export async function consumeInvite(tokenId: string): Promise<void> {
  await prisma.inviteToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  });
}
