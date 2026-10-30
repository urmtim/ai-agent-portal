import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ownConnections } from "@/lib/connections";
import { CONNECTORS, isConnectorKind, parseMailConfig, presetFor } from "@/lib/connectors";
import { AddConnectionButton, ConnectionActions } from "./McpModals";

const ids = (raw: string | undefined): string[] => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };

function status(c: { checkedAt: Date | null; checkOk: boolean | null; checkMsg: string }) {
  if (!c.checkedAt) return <span key="st" className="st mut">не проверено</span>;
  return c.checkOk
    ? <span key="st" className="st ok" title={c.checkMsg}>подключено</span>
    : <span key="st" className="st err" title={c.checkMsg}>ошибка</span>;
}

export default async function McpPage() {
  const user = await requireUser();
  const [conns, agents, assistant] = await Promise.all([
    ownConnections(user.id),
    prisma.agent.findMany({ where: { ownerId: user.id }, select: { name: true, mcpIds: true } }),
    prisma.assistant.findUnique({ where: { ownerId: user.id }, select: { mcpIds: true } }),
  ]);

  const rows: ListRow[] = conns.map((c, i) => {
    const kind = isConnectorKind(c.kind) ? CONNECTORS[c.kind] : null;
    const mail = parseMailConfig(c.config);
    const users = [
      ...(ids(assistant?.mcpIds).includes(c.id) ? ["Ассистент"] : []),
      ...agents.filter((a) => ids(a.mcpIds).includes(c.id)).map((a) => a.name),
    ];
    const st = !c.checkedAt ? "не проверено" : c.checkOk ? "подключено" : "ошибка";
    return {
      key: c.id,
      search: `${c.name} ${kind?.label ?? c.kind} ${mail?.user ?? ""} ${mail?.host ?? ""}`,
      facets: { status: st },
      cells: [
        <span key="id" className="muted">#{i + 1}</span>,
        <div key="n"><span className="b">{c.name}</span>{mail && <div className="sub">{mail.user} · {mail.host}</div>}</div>,
        kind?.label ?? c.kind,
        <span key="t" className="muted">{kind?.tools.join(", ") ?? "—"}</span>,
        users.length ? users.join(", ") : <span key="u" className="muted">—</span>,
        status(c),
        <ConnectionActions key="a" usedBy={users.length} c={{
          id: c.id, kind: c.kind, name: c.name, hasSecret: !!c.secretEnc,
          preset: presetFor(mail?.host ?? ""), host: mail?.host ?? "", port: mail?.port ?? 993, secure: mail?.secure ?? true, user: mail?.user ?? "",
        }} />,
      ],
    };
  });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">MCP</h1>
          <p className="lead">Подключения к внешним сервисам для Ассистента и агентов</p>
        </div>
      </div>
      <AiTabs active="/mcp" />
      <ListTable columns={["ID", "Название", "Коннектор", "Инструменты", "Используют", "Статус", ""]} rows={rows} minWidth={820}
        action={<AddConnectionButton />} emptyText="Подключений пока нет — добавьте первое, например почту"
        filters={[{ id: "status", label: "Статус", options: ["подключено", "ошибка", "не проверено"] }]} />
    </div>
  );
}
