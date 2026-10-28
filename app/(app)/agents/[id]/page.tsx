import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { runAgentNow, saveAgentConfig, deleteAgent } from "../actions";

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
        <form action={runAgentNow} className="spacer">
          <input type="hidden" name="agentId" value={agent.id} />
          <button className="btn primary" type="submit">▶ Запустить сейчас</button>
        </form>
      </div>

      <div className="card pad" style={{ marginBottom: 24 }}>
        <h2 className="title" style={{ fontSize: 16, marginBottom: 14 }}>Настройки</h2>
        <form action={saveAgentConfig}>
          <input type="hidden" name="agentId" value={agent.id} />

          <div className="field">
            <label htmlFor="name">Название</label>
            <input id="name" name="name" defaultValue={agent.name} />
          </div>

          <div className="grid cols3" style={{ gap: 14 }}>
            <div>
              <label htmlFor="sinceDays">За сколько дней смотреть</label>
              <input id="sinceDays" name="sinceDays" type="number" min={1} max={365}
                defaultValue={config.sinceDays ?? 30} />
            </div>
            <div>
              <label htmlFor="max">Макс. писем за прогон</label>
              <input id="max" name="max" type="number" min={1} max={200}
                defaultValue={config.max ?? 40} />
            </div>
            <div>
              <label htmlFor="fromFilter">Фильтр по отправителю</label>
              <input id="fromFilter" name="fromFilter" placeholder="например, pyaterochka"
                defaultValue={config.fromFilter ?? ""} />
            </div>
          </div>

          <label className="toggle" style={{ margin: "14px 0 18px" }}>
            <input type="checkbox" name="enabled" defaultChecked={agent.enabled} style={{ width: "auto" }} />
            <span>Агент включён</span>
          </label>

          <div className="wrap-gap">
            <button className="btn primary" type="submit">Сохранить</button>
          </div>
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
