import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fileLabel } from "@/lib/guardrail-docs";
import { guardDocIds, parseGuardRules } from "@/lib/agents/policy";
import { AddDocButton, DocActions } from "./GuardrailModals";

export default async function GuardrailsPage() {
  const user = await requireUser();
  const [docs, agents, assistant] = await Promise.all([
    prisma.guardrailDoc.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" },
      select: { id: true, name: true, description: true, fileName: true, size: true, enabled: true } }),
    prisma.agent.findMany({ where: { ownerId: user.id }, select: { name: true, guardrails: true } }),
    prisma.assistant.findUnique({ where: { ownerId: user.id }, select: { guardrails: true } }),
  ]);
  const uses = (id: string) => [
    ...(assistant && guardDocIds(parseGuardRules(assistant.guardrails)).includes(id) ? ["Ассистент"] : []),
    ...agents.filter((a) => guardDocIds(parseGuardRules(a.guardrails)).includes(id)).map((a) => a.name),
  ];

  const rows: ListRow[] = docs.map((d, i) => {
    const users = uses(d.id);
    const status = d.enabled ? "включён" : "выключен";
    const file = fileLabel(d.fileName, d.size);
    return {
      key: d.id,
      search: `${d.name} ${d.description} ${d.fileName}`,
      facets: { status },
      cells: [
        <span key="id" className="muted">#{i + 1}</span>,
        <div key="n"><span className="b">{d.name}</span>{d.description && <div className="sub">{d.description}</div>}</div>,
        <span key="f" className="muted">{file}</span>,
        users.length ? users.join(", ") : <span key="u" className="muted">—</span>,
        <span key="st" className={`st ${d.enabled ? "ok" : "mut"}`}>{status}</span>,
        <DocActions key="a" usedBy={users.length} d={{ id: d.id, name: d.name, description: d.description, file, enabled: d.enabled }} />,
      ],
    };
  });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Гардрейлы</h1>
          <p className="lead">Документы с правилами — регламенты, политики, инструкции. Агент получает их текст как правила, которые нельзя нарушать, когда документ добавлен ему на вкладке «Политики».</p>
        </div>
      </div>
      <AiTabs active="/guardrails" />
      <ListTable columns={["ID", "Название", "Файл", "Используют", "Статус", ""]} rows={rows} minWidth={760}
        action={<AddDocButton />} emptyText="Документов пока нет — загрузите первый: регламент, политику или инструкцию"
        filters={[{ id: "status", label: "Статус", options: ["включён", "выключен"] }]} />
    </div>
  );
}
