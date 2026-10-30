import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { prisma } from "@/lib/db";
import { envModelName } from "@/lib/llm";
import { requireUser } from "@/lib/session";
import { modelUsers } from "@/lib/model-users";
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
  const models = await prisma.llmModel.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
  const users = await modelUsers(user.id);
  const envName = models.length === 0 ? envModelName() : null;

  const rows: ListRow[] = models.map((m, i) => ({
    key: m.id,
    search: `${m.name} ${m.description} ${m.model} ${m.baseUrl}`,
    cells: [
      <span key="id" className="muted">#{i + 1}</span>,
      <div key="n">
        <div className="b">{m.name}</div>
        {m.description && <div className="sub">{m.description}</div>}
      </div>,
      <code key="m" className="muted" style={{ wordBreak: "break-all" }}>{m.model}</code>,
      <span key="u" title={users.get(m.id)?.join(", ")}>{users.get(m.id)?.length ?? 0}</span>,
      status(m),
      <ModelActions key="a" m={{ id: m.id, name: m.name, description: m.description, baseUrl: m.baseUrl, model: m.model, hasToken: !!m.tokenEnc, contextTokens: m.contextTokens, usedBy: users.get(m.id) ?? [] }} />,
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
            Сейчас агенты работают на модели из <code>.env</code> — <b>{envName}</b>. Добавьте модель здесь — на неё перейдут Ассистент и агенты.
          </div>
        </div>
      )}

      <ListTable columns={["ID", "Название", "Модель", "Агенты", "Статус", ""]} rows={rows} action={<AddModelButton />} minWidth={700}
        emptyText="Моделей пока нет — добавьте первую" />
    </div>
  );
}
