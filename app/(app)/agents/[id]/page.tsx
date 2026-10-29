import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgentNow, deleteAgent } from "../actions";
import { AgentEditButton } from "../AgentModals";
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
  const models = await prisma.llmModel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, isDefault: true } });
  const defaultName = (models.find((m) => m.isDefault) ?? models[0])?.name ?? envModelName() ?? "не задана";

  const config = JSON.parse(agent.config || "{}") as {
    sinceDays?: number; fromFilter?: string; max?: number;
  };

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <Link href="/agents" className="back">← Агенты</Link>

      <div className="pagehead">
        <div>
          <h1 className="title">{agent.name}</h1>
          <p className="lead">Собирает чеки из почты и пишет их в «Траты»</p>
        </div>
        <div className="spacer" />
        <AgentEditButton models={models.map(({ id, name }) => ({ id, name }))} defaultModel={defaultName}
          a={{ id: agent.id, name: agent.name, enabled: agent.enabled, modelId: agent.modelId, sinceDays: config.sinceDays ?? 30, max: config.max ?? 40, fromFilter: config.fromFilter ?? "" }} />
        <form action={runAgentNow}>
          <input type="hidden" name="agentId" value={agent.id} />
          <button className="btn primary" type="submit">▶ Запустить сейчас</button>
        </form>
      </div>

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
