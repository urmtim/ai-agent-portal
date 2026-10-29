import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { imapConfigured } from "@/lib/mailbox";
import { envModelName, llmAvailable } from "@/lib/llm";
import { AGENT_TYPES } from "@/lib/agents/types";
import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { AgentActions, NewAgentButton } from "./AgentModals";
import { agentEditData } from "@/lib/agents/edit-data";
import { loadAssistant } from "@/lib/assistant";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import { AssistantActions } from "./assistant/AssistantForm";

const RUN_ST: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "идёт", cls: "info" },
  OK: { label: "успех", cls: "ok" },
  ERROR: { label: "ошибка", cls: "err" },
};

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export default async function AgentsPage() {
  const user = await requireUser();
  const agents = await prisma.agent.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 1 }, model: { select: { name: true } } },
  });

  // the mail warning only matters to someone who has an agent that reads mail
  const mailOk = imapConfigured() || !agents.some((a) => AGENT_TYPES[a.type].mcp.includes("Почта"));
  const llmOk = await llmAvailable();
  const models = await prisma.llmModel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, isDefault: true } });
  const model = (models.find((m) => m.isDefault) ?? models[0])?.name ?? envModelName() ?? "не задана";
  const choices = {
    models: models.map(({ id, name }) => ({ id, name })),
    defaultModel: model,
    agents: agents.map((a) => ({ id: a.id, name: a.name, desc: AGENT_TYPES[a.type].desc, enabled: a.enabled })),
  };

  // the chat's own agent: model and what it may use come from its modal (assistant/AssistantForm.tsx)
  const cfg = await loadAssistant(user.id);
  const allowed = [
    cfg.agentIds.length && `агенты: ${agents.filter((a) => cfg.agentIds.includes(a.id)).map((a) => a.name).join(", ")}`,
    cfg.apis.length && `API: ${cfg.apis.map((k) => ASSISTANT_APIS[k].label).join(", ")}`,
  ].filter(Boolean).join(" · ");
  const base: ListRow = {
    key: "base",
    search: "Ассистент встроенный чат",
    cells: [
      <span key="id" className="muted">#1</span>,
      <div key="n">
        <div className="b">Ассистент</div>
        <div className="sub">С ним вы говорите в чате, агенты — его исполнители · {allowed ? `разрешено — ${allowed}` : "пока ничего не разрешено"}</div>
      </div>,
      <span key="mo" style={{ whiteSpace: "nowrap" }}>{models.find((m) => m.id === cfg.modelId)?.name ?? model}</span>,
      <span key="m" className="muted">{cfg.mcpIds.length ? cfg.mcpIds.length : "—"}</span>,
      <span key="st" className="st info">встроенный</span>,
      <span key="r" className="muted">—</span>,
      <AssistantActions key="a" cfg={cfg} {...choices} />,
    ],
  };

  const rows: ListRow[] = agents.map((a, i) => {
    const t = AGENT_TYPES[a.type];
    const last = a.runs[0];
    const rs = last ? RUN_ST[last.status] : null;
    const status = a.enabled ? "включён" : "выключен";
    return {
      key: a.id,
      search: `${a.name} ${t.desc} ${t.mcp.join(" ")}`,
      facets: { status },
      cells: [
        <span key="id" className="muted">#{i + 2}</span>, // #1 is the base assistant
        <div key="n">
          <Link href={`/agents/${a.id}`} className="b link">{a.name}</Link>
          <div className="sub">{t.desc}</div>
        </div>,
        <span key="mo" style={{ whiteSpace: "nowrap" }}>{a.model?.name ?? model}</span>,
        t.mcp.join(", "),
        <span key="st" className={`st ${a.enabled ? "ok" : "mut"}`}>{status}</span>,
        last ? (
          <div key="r">
            <span className={`st ${rs?.cls}`}>{rs?.label}</span>{" "}
            <span className="muted" style={{ fontSize: 12.5 }}>{fmt(last.startedAt)}</span>
            {last.summary && <div className="sub">{last.summary}</div>}
          </div>
        ) : (
          <span key="r" className="muted">—</span>
        ),
        <AgentActions key="a" {...choices} a={agentEditData(a)} />,
      ],
    };
  });

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Агенты</h1>
          <p className="lead">ИИ-помощники, которые делают рутину за вас</p>
        </div>
      </div>
      <AiTabs active="/agents" />

      {(!mailOk || !llmOk) && (
        <div className="callout warn" style={{ margin: "0 0 18px" }}>
          <span className="ic">⚠️</span>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            {!mailOk && (
              <p style={{ margin: 0 }}>
                <b>Почта не подключена.</b> Агент «Чеки из почты» читает письма в вашем ящике и находит в них чеки — для этого ему нужен
                доступ к ящику: адрес почтового сервера, логин и пароль приложения (в Mail.ru — «Пароли для внешних приложений»).
                Пока их задают в файле <code>.env</code> на сервере: <code>IMAP_HOST</code>, <code>IMAP_USER</code>, <code>IMAP_PASSWORD</code>.
                Без этого запуск агента закончится ошибкой «Почта не настроена».
              </p>
            )}
            {!llmOk && (
              <p style={{ margin: !mailOk ? "8px 0 0" : 0 }}>
                <b>Нет модели.</b> Агентам нужна LLM — добавьте её в разделе <Link href="/models" className="b link">«Модели»</Link>.
              </p>
            )}
          </div>
        </div>
      )}

      <ListTable
        action={<NewAgentButton {...choices} />}
        columns={["ID", "Название", "Модель", "MCP", "Статус", "Последний прогон", ""]}
        rows={[base, ...rows]}
        minWidth={820}
        filters={[{ id: "status", label: "Статус", options: ["включён", "выключен"] }]}
      />
    </div>
  );
}
