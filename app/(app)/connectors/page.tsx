import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ownConnectors } from "@/lib/connections";
import { CONNECTORS, MAIL_PORTS, isConnectorKind, parseApiConfig, parseMailConfig } from "@/lib/connectors";
import { EMPTY_FIELDS, type ConnectorFields } from "@/lib/connector-spec";
import { parseToolsOff } from "@/lib/mail-catalog";
import { limitsToFields, parseLimits } from "@/lib/mail-limits";
import { AddConnectorButton, ConnectorActions } from "./ConnectorModals";

const ids = (raw: string | undefined): string[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

type Row = Awaited<ReturnType<typeof ownConnectors>>[number];

function statusOf(c: Row): string {
  if (!c.enabled) return "выключен";
  if (!c.checkedAt) return "не проверено";
  return c.checkOk ? "подключено" : "ошибка";
}
const ST_CLS: Record<string, string> = { "выключен": "mut", "не проверено": "mut", "подключено": "ok", "ошибка": "err" };

/** A saved connector → the window's fields (no password or token). */
function fieldsOf(c: Row): ConnectorFields {
  const base = { ...EMPTY_FIELDS, kind: isConnectorKind(c.kind) ? c.kind : "mail", name: c.name, description: c.description, enabled: c.enabled, toolsOff: parseToolsOff(c.toolsOff), limits: limitsToFields(parseLimits(c.limits)) } as ConnectorFields;
  const m = c.kind === "mail" ? parseMailConfig(c.config) : null;
  if (m) return { ...base, protocol: m.protocol, host: m.host, port: String(m.port), sending: m.smtpHost ? "smtp" : "none", smtpHost: m.smtpHost, smtpPort: String(m.smtpHost ? m.smtpPort : MAIL_PORTS.smtp), user: m.user };
  return { ...base, url: parseApiConfig(c.config)?.url ?? "" };
}

export default async function ConnectorsPage() {
  const user = await requireUser();
  const [conns, agents, assistant] = await Promise.all([
    ownConnectors(user.id),
    prisma.agent.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { name: true, connectorIds: true } }),
    prisma.assistant.findUnique({ where: { ownerId: user.id }, select: { connectorIds: true } }),
  ]);

  const rows: ListRow[] = conns.map((c, i) => {
    const usedBy = [
      ...(ids(assistant?.connectorIds).includes(c.id) ? ["Ассистент"] : []),
      ...agents.filter((a) => ids(a.connectorIds).includes(c.id)).map((a) => a.name),
    ];
    const st = statusOf(c);
    const type = isConnectorKind(c.kind) ? CONNECTORS[c.kind].label : c.kind;
    return {
      key: c.id,
      search: `${c.name} ${c.description} ${type}`,
      facets: { status: st, type },
      cells: [
        <span key="id" className="muted">#{i + 1}</span>,
        <div key="n"><span className="b">{c.name}</span>{c.description && <div className="sub">{c.description}</div>}</div>,
        type,
        usedBy.length ? usedBy.join(", ") : <span key="u" className="muted">—</span>,
        <span key="st" className={`st ${ST_CLS[st]}`} title={!c.enabled ? "Агенты его не получают" : c.checkMsg || undefined}>{st}</span>,
        <ConnectorActions key="a" c={{ id: c.id, fields: fieldsOf(c), hasSecret: !!c.secretEnc, usedBy }} />,
      ],
    };
  });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Коннекторы</h1>
          <p className="lead">Почта и API: куда подключаться и с каким входом</p>
        </div>
      </div>
      <AiTabs active="/connectors" />
      <ListTable columns={["ID", "Название", "Тип", "Используют", "Статус", ""]} rows={rows} minWidth={760}
        action={<AddConnectorButton />} emptyText="Коннекторов пока нет — добавьте первый, например почту"
        filters={[
          { id: "status", label: "Статус", options: ["подключено", "ошибка", "не проверено", "выключен"] },
          { id: "type", label: "Тип", options: Object.values(CONNECTORS).map((k) => k.label) },
        ]} />
    </div>
  );
}
