import { AiTabs } from "@/components/AiTabs";
import { ListTable } from "@/components/ui/ListTable";
import { requireUser } from "@/lib/session";

/** MCP servers (built into the portal and outside ones) come next; mailboxes moved to «Коннекторы». */
export default async function McpPage() {
  await requireUser();
  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">MCP</h1>
          <p className="lead">Серверы с инструментами для Ассистента и агентов: встроенные в портал и внешние</p>
        </div>
      </div>
      <AiTabs active="/mcp" />
      <ListTable columns={["ID", "Название", "Тип", "Инструменты", "Используют", "Статус", ""]} rows={[]} minWidth={820}
        action={<button type="button" className="btn primary spacer" disabled title="Раздел в разработке">Добавить</button>}
        emptyText="Раздел в разработке: здесь появятся MCP-серверы. Почта и API — в разделе «Коннекторы»" />
    </div>
  );
}
