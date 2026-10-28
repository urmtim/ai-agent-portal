import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { imapConfigured } from "@/lib/mailbox";
import { llmConfigured } from "@/lib/llm";
import { createReceiptsAgent, runAgentNow } from "./actions";

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
    include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } },
  });

  const hasReceipts = agents.some((a) => a.type === "RECEIPTS");
  const mailOk = imapConfigured();
  const llmOk = llmConfigured();

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Агенты</h1>
          <p className="lead">ИИ-помощники, которые делают рутину за вас</p>
        </div>
        {!hasReceipts && (
          <form action={createReceiptsAgent} className="spacer">
            <button className="btn primary" type="submit">+ Агент «Чеки из почты»</button>
          </form>
        )}
      </div>

      {(!mailOk || !llmOk) && (
        <div className="callout warn" style={{ marginBottom: 20 }}>
          <span className="ic">⚠️</span>
          <div style={{ fontSize: 13.5 }}>
            Чтобы агент «Чеки» работал, задайте в <code>.env</code>:{" "}
            {!mailOk && <b>IMAP_USER / IMAP_PASSWORD</b>}
            {!mailOk && !llmOk && " и "}
            {!llmOk && <b>LLM_BASE_URL / LLM_MODEL</b>}. Запустить можно и сейчас — прогон просто
            завершится с ошибкой и покажет, чего не хватает.
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div className="card empty">
          Пока нет агентов. Создайте первого — «Чеки из почты».
        </div>
      ) : (
        <div className="grid cols2">
          {agents.map((a) => {
            const last = a.runs[0];
            const st = last ? RUN_ST[last.status] : null;
            return (
              <div key={a.id} className="card pad">
                <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                  <span className="emoji" style={{ width: 42, height: 42, fontSize: 22 }}>🧾</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                    <div className="sub">Чеки из почты → траты</div>
                  </div>
                  {!a.enabled && <span className="st mut">выключен</span>}
                </div>

                <div className="muted" style={{ fontSize: 13, marginBottom: 14, minHeight: 20 }}>
                  {last ? (
                    <>
                      Последний прогон: <span className={`st ${st?.cls}`}>{st?.label}</span>{" "}
                      {fmt(last.startedAt)} — {last.summary}
                    </>
                  ) : (
                    "Ещё не запускался"
                  )}
                </div>

                <div className="wrap-gap">
                  <form action={runAgentNow}>
                    <input type="hidden" name="agentId" value={a.id} />
                    <button className="btn primary sm" type="submit">▶ Запустить сейчас</button>
                  </form>
                  <Link href={`/agents/${a.id}`} className="btn ghost sm">Настройки и история</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
