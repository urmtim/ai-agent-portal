import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/secret";
import { connectorDesc, parseApiConfig, parseMailConfig, apiCheckMessage, type ApiConfig } from "@/lib/connectors";
import type { MailAccess } from "@/lib/mailbox";
import type { Agent, Connector } from "@prisma/client";
import type { AccessInfo, AgentInfo, ConnectorInfo } from "@/lib/chat/policy-tools";
import { agentDesc } from "@/lib/agents/types";
import { hitlAsks } from "@/lib/agents/policy";
import { availableMailTools, mailGives, parseToolsOff, type MailAbility } from "@/lib/mail-catalog";
import { limitsText, parseLimits } from "@/lib/mail-limits";

type Row = { kind: string; name: string; config: string; secretEnc: string | null; limits?: string };

/** The user's connectors, oldest first (#1, #2…). */
export function ownConnectors(userId: string) {
  return prisma.connector.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
}

/** Mail settings + decrypted password of a «Почта» connector; throws a readable error when unusable. */
export function mailAccess(c: Row): MailAccess {
  if (c.kind !== "mail") throw new Error(`«${c.name}» — не почта`);
  const cfg = parseMailConfig(c.config);
  if (!cfg) throw new Error(`Коннектор «${c.name}» настроен не до конца — откройте его в разделе «Коннекторы»`);
  const pass = c.secretEnc ? decryptSecret(c.secretEnc) : null;
  if (!pass) throw new Error(`Пароль коннектора «${c.name}» не читается — введите его заново в разделе «Коннекторы»`);
  return { ...cfg, pass, limits: parseLimits(c.limits) };
}

/** Address + decrypted token (null: none) of an «API» connector. */
export function apiAccess(c: Row): ApiConfig & { token: string | null } {
  const cfg = parseApiConfig(c.config);
  if (c.kind !== "api" || !cfg) throw new Error(`Коннектор «${c.name}» настроен не до конца — откройте его в разделе «Коннекторы»`);
  return { ...cfg, token: c.secretEnc ? decryptSecret(c.secretEnc) : null };
}

/** «Проверить» an API: GET the address, with the token when there is one. */
export async function checkApi(a: { url: string; token: string | null }): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(a.url, {
      headers: a.token ? { Authorization: `Bearer ${a.token}` } : {}, redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    await r.body?.cancel().catch(() => {});
    return apiCheckMessage(r.status);
  } catch {
    return apiCheckMessage(null);
  }
}

/** What a mail connector's connection allows (null: not set up). */
function abilityOf(c: { config: string }): MailAbility | null {
  const m = parseMailConfig(c.config);
  return m ? { protocol: m.protocol, smtp: !!m.smtpHost } : null;
}

/** The model's tool names a «Почта» connector gives: switched on on its «Инструменты» tab and allowed by its connection. */
export function connectorMailTools(c: { config: string; toolsOff: string } | null): string[] {
  const a = c ? abilityOf(c) : null;
  return a ? availableMailTools(a, parseToolsOff(c!.toolsOff)) : [];
}

const idsOf = (raw: string): string[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };

/** How deep agents may call agents: the chain of calls, never one already in it (lib/agents/runner.ts). */
export const MAX_AGENT_CHAIN = 5;

/**
 * Switched-on connectors as the model is told about them: type, name, what it is for (its description) and what it gives.
 * The mail tools work with the first switched-on mailbox (`mailId`); another one gives nothing.
 */
function describeConnectors(rows: Connector[], mailId: string | null): ConnectorInfo[] {
  const mailName = rows.find((c) => c.id === mailId)?.name;
  return rows.map((c) => {
    if (c.kind === "mail") {
      const cfg = parseMailConfig(c.config);
      return {
        name: c.name, type: "Почта", about: connectorDesc(c), server: cfg ? `${cfg.protocol.toUpperCase()} ${cfg.host}` : "",
        ...(c.id === mailId && cfg ? { limits: limitsText(parseLimits(c.limits), cfg.protocol) } : {}),
        gives: c.id !== mailId ? `ничего: почтовые инструменты работают с «${mailName}»` : cfg ? mailGives({ protocol: cfg.protocol, smtp: !!cfg.smtpHost }, parseToolsOff(c.toolsOff)) : "ничего: настроен не до конца",
      };
    }
    const api = parseApiConfig(c.config);
    return { name: c.name, type: "API", about: connectorDesc(c), server: api ? api.url.replace(/^https?:\/\//, "").split("/")[0] : "", gives: "пока ничего: агенты API не используют" };
  });
}

/** The first switched-on mailbox among `ids`, in that order of creation (the one the mail tools use). */
const firstMail = (rows: Connector[], ids: string[]) => rows.find((c) => c.kind === "mail" && ids.includes(c.id))?.id ?? null;

/**
 * Agents as the model is told about them: what each is for, its own connections and the agents it may call in turn —
 * as deep as runs may go, never back into the chain (`chain` — ids already running above). Nested ones need no confirmation.
 */
export async function agentTree(userId: string, roots: Agent[], chain: string[]): Promise<AgentInfo[]> {
  const [agents, conns] = await Promise.all([
    prisma.agent.findMany({ where: { ownerId: userId, enabled: true }, orderBy: { createdAt: "asc" } }),
    prisma.connector.findMany({ where: { ownerId: userId, enabled: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const build = (a: Agent, above: string[]): AgentInfo => {
    const own = idsOf(a.connectorIds), path = [...above, a.id];
    const subs = path.length >= MAX_AGENT_CHAIN ? []
      : agents.filter((s) => idsOf(a.agentIds).includes(s.id) && !path.includes(s.id) && !hitlAsks(s.hitl));
    const rows = conns.filter((c) => own.includes(c.id));
    return { name: a.name, about: agentDesc(a), connectors: describeConnectors(rows, firstMail(rows, own)), agents: subs.map((s) => build(s, path)) };
  };
  return roots.map((a) => build(a, chain));
}

/**
 * What get_policies tells the model about its own setup: the model, the switched-on connectors among `ids`
 * (`mailId` — the mailbox the mail tools work on) and the agents it may run with all they have. No logins.
 */
export async function accessInfo(userId: string, modelId: string | null, ids: string[], mailId: string | null, agents: AgentInfo[] = []): Promise<AccessInfo> {
  const [m, rows] = await Promise.all([
    modelId ? prisma.llmModel.findFirst({ where: { id: modelId, ownerId: userId }, select: { name: true, model: true, baseUrl: true } }) : null,
    ids.length ? prisma.connector.findMany({ where: { ownerId: userId, enabled: true, id: { in: ids } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  return {
    model: m ? { name: m.name, model: m.model, server: m.baseUrl.replace(/^https?:\/\//, "").split("/")[0] } : null,
    connectors: describeConnectors(rows, mailId),
    agents,
  };
}

/** First switched-on «Почта» connector among the given ids that the user owns, or null. */
export async function firstMailConnector(userId: string, ids: string[]) {
  if (!ids.length) return null;
  const rows = await prisma.connector.findMany({ where: { ownerId: userId, kind: "mail", enabled: true, id: { in: ids } }, orderBy: { createdAt: "asc" } });
  return rows[0] ?? null;
}
