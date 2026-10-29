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

  // models are personal: the page shows and manages only the user's own
  const models = await prisma.llmModel.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { agents: true } } } });
  const unassigned = await prisma.agent.count({ where: { ownerId: user.id, modelId: null } });
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
      </div>,
      <code key="m" className="muted" style={{ wordBreak: "break-all" }}>{m.model}</code>,
      m._count.agents + (m.id === defaultId ? unassigned : 0),
      status(m),
      <ModelActions key="a" m={{ id: m.id, name: m.name, baseUrl: m.baseUrl, model: m.model, isDefault: m.id === defaultId, hasToken: !!m.tokenEnc, contextTokens: m.contextTokens }} />,
    ],
  }));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Модели</h1>
          <p className="lead">Ваши LLM: на них работают ваш ассистент и ваши агенты. У каждого пользователя свои модели и токены.</p>
        </div>
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

      <ListTable columns={["ID", "Название", "Модель", "Агенты", "Статус", ""]} rows={rows} action={<AddModelButton />} minWidth={700}
        emptyText="Моделей пока нет — добавьте первую" />
    </div>
  );
}
