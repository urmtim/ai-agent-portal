import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { imapConfigured } from "@/lib/mailbox";
import { envModelName, llmAvailable } from "@/lib/llm";
import { AGENT_TYPES } from "@/lib/agents/types";
import { AiTabs } from "@/components/AiTabs";
import { ListTable, type ListRow } from "@/components/ui/ListTable";
import { AgentActions, NewAgentButton } from "./AgentModals";

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

  const mailOk = imapConfigured();
  const llmOk = await llmAvailable();
  const models = await prisma.llmModel.findMany({ orderBy: { createdAt: "asc" }, select: { name: true, isDefault: true } });
  const model = (models.find((m) => m.isDefault) ?? models[0])?.name ?? envModelName() ?? "не задана";

  const base: ListRow = {
    key: "base",
    className: "off",
    search: "Базовый ассистент встроенный",
    cells: [
      <span key="id" className="muted">—</span>,
      <div key="n">
        <div className="b">Базовый ассистент</div>
        <div className="sub">Отвечает, когда не подошёл спец-агент · встроенный, не настраивается</div>
      </div>,
      model,
      <span key="m" className="muted">—</span>,
      <span key="st" className="st mut">встроенный</span>,
      <span key="r" className="muted">—</span>,
      null,
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
        <span key="id" className="muted">#{i + 1}</span>,
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
        <AgentActions key="a" id={a.id} name={a.name} />,
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
        <NewAgentButton />
      </div>
      <AiTabs active="/agents" />

      {(!mailOk || !llmOk) && (
        <div className="callout warn" style={{ margin: "0 0 18px" }}>
          <span className="ic">⚠️</span>
          <div style={{ fontSize: 13.5 }}>
            Чтобы агенты работали,{" "}
            {!mailOk && <>задайте в <code>.env</code> <b>IMAP_HOST / IMAP_USER / IMAP_PASSWORD</b></>}
            {!mailOk && !llmOk && " и "}
            {!llmOk && <>добавьте модель в разделе <Link href="/models" className="b link">«Модели»</Link></>}. Запустить можно и сейчас — прогон
            просто завершится с ошибкой и покажет, чего не хватает.
          </div>
        </div>
      )}

      <ListTable
        columns={["ID", "Название", "Модель", "MCP", "Статус", "Последний прогон", ""]}
        rows={[base, ...rows]}
        minWidth={820}
        filters={[{ id: "status", label: "Статус", options: ["включён", "выключен"] }]}
      />
    </div>
  );
}
