import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { prisma } from "@/lib/db";
import { envModelName } from "@/lib/llm";
import { requireUser } from "@/lib/session";
import { AddModelButton, ModelActions } from "./ModelModals";

function status(m: { checkedAt: Date | null; checkOk: boolean | null; checkMsg: string }) {
  if (!m.checkedAt) return <span className="st mut">не проверена</span>;
  return m.checkOk
    ? <span className="st ok" title={m.checkMsg}>подключена</span>
    : <span className="st err" title={m.checkMsg}>ошибка</span>;
}

export default async function ModelsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const models = await prisma.llmModel.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { agents: true } } } });
  const unassigned = await prisma.agent.count({ where: { modelId: null } });
  const defaultId = (models.find((m) => m.isDefault) ?? models[0])?.id;
  const envName = models.length === 0 ? envModelName() : null;

  const rows: ListRow[] = models.map((m, i) => ({
    key: m.id,
    search: `${m.name} ${m.model} ${m.baseUrl}`,
    cells: [
      <span key="id" className="muted">#{i + 1}</span>,
      <div key="n">
        <span className="b">{m.name}</span>
        {m.id === defaultId && <span className="st info" style={{ marginLeft: 8 }}>по умолчанию</span>}
        {m.name !== m.model && <div className="sub">{m.model}</div>}
      </div>,
      <span key="u" className="muted" style={{ wordBreak: "break-all" }}>{m.baseUrl.replace(/^https?:\/\//, "")}</span>,
      m._count.agents + (m.id === defaultId ? unassigned : 0),
      status(m),
      isAdmin ? (
        <ModelActions key="a" m={{ id: m.id, name: m.name, baseUrl: m.baseUrl, model: m.model, isDefault: m.id === defaultId, hasToken: !!m.tokenEnc }} />
      ) : null,
    ],
  }));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Модели</h1>
          <p className="lead">LLM, к которым ходят агенты. Моделей может быть много: базовый ассистент работает на одной, другой агент — на другой.</p>
        </div>
        {isAdmin && <AddModelButton />}
      </div>
      <AiTabs active="/models" />

      {envName && (
        <div className="callout info" style={{ margin: "0 0 18px" }}>
          <span className="ic">ℹ️</span>
          <div style={{ fontSize: 13.5 }}>
            Сейчас агенты работают на модели из <code>.env</code> — <b>{envName}</b>. Добавьте модель здесь, и она станет моделью по умолчанию.
          </div>
        </div>
      )}

      <ListTable columns={["ID", "Название", "Адрес API", "Агенты", "Статус", ""]} rows={rows} minWidth={700}
        emptyText={isAdmin ? "Моделей пока нет — добавьте первую" : "Моделей пока нет"} />
    </div>
  );
}
