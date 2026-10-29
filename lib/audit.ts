import "server-only";
import { prisma } from "@/lib/db";
import { searchText, SYSTEM_ACTOR, type AuditChannel, type AuditEvent } from "@/lib/audit-events";

export type AuditActor = { id: string; name?: string | null; email?: string | null } | { name: string } | null;

/**
 * Writes one journal entry. Never throws: a failing journal must not break the action itself.
 * Never pass passwords, tokens or chat message text in details.
 */
export async function audit(event: AuditEvent, details: string, actor: AuditActor = null, channel: AuditChannel = "портал"): Promise<void> {
  const actorId = actor && "id" in actor ? actor.id : null;
  const actorName = (actor && (actor.name || ("email" in actor ? actor.email : null))) || SYSTEM_ACTOR;
  try {
    await prisma.auditLog.create({
      data: { actorId, actorName, event, channel, details, search: searchText(actorName, event, details) },
    });
  } catch (e) {
    console.error("audit log write failed:", (e as Error).message);
  }
}
