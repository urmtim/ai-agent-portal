import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgentNow, deleteAgent } from "../actions";
import { AgentEditButton } from "../AgentModals";
import { agentEditData } from "@/lib/agents/edit-data";
import { agentDesc } from "@/lib/agents/types";
import { ownConnections } from "@/lib/connections";
import { CONNECTORS, isConnectorKind } from "@/lib/connectors";
import { envModelName } from "@/lib/llm";

const RUN_ST: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "идёт", cls: "info" },
  OK: { label: "успех", cls: "ok" },
  ERROR: { label: "ошибка", cls: "err" },
};

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d);
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 20 } },
  });
  if (!agent || agent.ownerId !== user.id) notFound();
  const conns = await ownConnections(user.id);
  const docs = await prisma.guardrailDoc.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, description: true, enabled: true } });
  const own = await prisma.agent.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
  const models = await prisma.llmModel.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, isDefault: true } });
  const defaultName = (models.find((m) => m.isDefault) ?? models[0])?.name ?? envModelName() ?? "не задана";

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <Link href="/agents" className="back">← Агенты</Link>

      <div className="pagehead">
        <div>
          <h1 className="title">{agent.name}</h1>
          <p className="lead">{agentDesc(agent)}</p>
        </div>
        <div className="spacer" />
        <AgentEditButton models={models.map(({ id, name }) => ({ id, name }))} defaultModel={defaultName}
          defaultModelId={(models.find((m) => m.isDefault) ?? models[0])?.id ?? ""} a={agentEditData(agent)}
          agents={own.map((x) => ({ id: x.id, name: x.name, desc: agentDesc(x), enabled: x.enabled }))}
          connections={conns.map((c) => ({ id: c.id, name: c.name, desc: isConnectorKind(c.kind) ? CONNECTORS[c.kind].desc : c.kind }))}
          docs={docs.map((d) => ({ id: d.id, name: d.name, desc: d.description, enabled: d.enabled }))} />
      </div>

      <form action={runAgentNow} className="card pad" style={{ marginBottom: 20 }}>
        <input type="hidden" name="agentId" value={agent.id} />
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="ag-task">Задача</label>
          <textarea id="ag-task" name="task" rows={3} maxLength={2000} placeholder="Что сделать на этот раз. Пусто — агент работает просто по своей инструкции." />
        </div>
        <button className="btn primary" type="submit">▶ Запустить</button>
      </form>

      <h2 className="title" style={{ fontSize: 16, marginBottom: 12 }}>История прогонов</h2>
      {agent.runs.length === 0 ? (
        <div className="card empty">Ещё не запускался.</div>
      ) : (
        <div className="grid" style={{ gap: 12 }}>
          {agent.runs.map((r) => {
            const st = RUN_ST[r.status];
            return (
              <div key={r.id} className="card pad">
                <div className="row" style={{ gap: 12 }}>
                  <span className={`st ${st?.cls}`}>{st?.label}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{fmt(r.startedAt)}</span>
                  <span className="spacer" />
                  <span style={{ fontSize: 13.5 }}>{r.summary}</span>
                </div>
                {r.log && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>
                      Лог прогона
                    </summary>
                    <pre style={{
                      whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 8,
                      background: "var(--soft)", padding: 12, borderRadius: 8, lineHeight: 1.5,
                    }}>{r.log}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form action={deleteAgent} style={{ marginTop: 24 }}>
        <input type="hidden" name="agentId" value={agent.id} />
        <button className="btn danger sm" type="submit">Удалить агента</button>
      </form>
    </div>
  );
}
