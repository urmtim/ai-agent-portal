import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AUDIT_CHANNELS, AUDIT_EVENTS, isAuditEvent, pageList } from "@/lib/audit-events";
import { LogControls } from "./LogControls";

const PER_PAGE = 50;

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(d).replace(",", "");
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const events = list(sp.ev).filter(isAuditEvent);
  const channels = list(sp.ch).filter((c) => (AUDIT_CHANNELS as readonly string[]).includes(c));

  const where: Prisma.AuditLogWhereInput = {
    ...(q && { search: { contains: q.toLowerCase() } }),
    ...(events.length && { event: { in: events } }),
    ...(channels.length && { channel: { in: channels } }),
  };
  const total = await prisma.auditLog.count({ where });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = await prisma.auditLog.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE });

  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    events.forEach((e) => u.append("ev", e));
    channels.forEach((c) => u.append("ch", c));
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `/admin/log?${s}` : "/admin/log";
  };
  const filtered = !!(q || events.length || channels.length);

  return (
    <>
      <div className="pagehead">
        <h1 className="title">Журнал</h1>
        <span className="count" aria-label={`Записей: ${total}`}>{total}</span>
      </div>

      <LogControls q={q} events={events} channels={channels} />

      <div className="card tcard">
        <table className="logtable" style={{ minWidth: 820 }}>
          <thead>
            <tr><th>Дата</th><th>Пользователь</th><th>Событие</th><th>Канал</th><th>Детали</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>{filtered ? "Ничего не найдено" : "Записей пока нет"}</td></tr>
            ) : rows.map((r) => {
              const ev = isAuditEvent(r.event) ? AUDIT_EVENTS[r.event] : { label: r.event, tone: "mut" };
              return (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmt(r.at)}</td>
                  <td><b>{r.actorName}</b></td>
                  <td><span className={`st ${ev.tone}`}>{ev.label}</span></td>
                  <td className="muted">{r.channel}</td>
                  <td className="logdetails">{r.details}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Страницы">
          {page > 1 ? <Link href={href(page - 1)} aria-label="Предыдущая">‹</Link> : <span className="off">‹</span>}
          {pageList(page, pages).map((p, i) => p === "…"
            ? <span key={`gap${i}`} className="gap">…</span>
            : <Link key={p} href={href(p)} className={p === page ? "on" : undefined} aria-current={p === page ? "page" : undefined}>{p}</Link>)}
          {page < pages ? <Link href={href(page + 1)} aria-label="Следующая">›</Link> : <span className="off">›</span>}
        </nav>
      )}
    </>
  );
}
