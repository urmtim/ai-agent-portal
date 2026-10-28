import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";

function rub(n: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d);
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" }).format(d);
}

export default async function StatsPage() {
  const user = await requireUser();
  const receipts = await prisma.receipt.findMany({
    where: { ownerId: user.id },
    orderBy: { purchasedAt: "desc" },
  });

  const now = new Date();
  const thisMonth = monthKey(now);

  const totalAll = receipts.reduce((s, r) => s + r.total, 0);
  const monthReceipts = receipts.filter((r) => monthKey(r.purchasedAt) === thisMonth);
  const monthTotal = monthReceipts.reduce((s, r) => s + r.total, 0);
  const avg = receipts.length ? totalAll / receipts.length : 0;

  // by category
  const catMap = new Map<string, number>();
  for (const r of receipts) catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.total);
  const byCategory = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
  const catMax = byCategory[0]?.[1] ?? 1;

  // by merchant (top 6)
  const merMap = new Map<string, number>();
  for (const r of receipts) merMap.set(r.merchant, (merMap.get(r.merchant) ?? 0) + r.total);
  const byMerchant = [...merMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const merMax = byMerchant[0]?.[1] ?? 1;

  // last 6 months
  const months: { key: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d), total: 0 });
  }
  for (const r of receipts) {
    const m = months.find((x) => x.key === monthKey(r.purchasedAt));
    if (m) m.total += r.total;
  }
  const monthMax = Math.max(1, ...months.map((m) => m.total));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Траты</h1>
          <p className="lead">Собрано из чеков на почте</p>
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="card empty">
          Пока нет данных. Запустите агента{" "}
          <Link href="/agents" style={{ color: "var(--primary-dark)", fontWeight: 600 }}>«Чеки из почты»</Link>
          {" "}— чеки появятся здесь.
        </div>
      ) : (
        <>
          <div className="grid cols3" style={{ marginBottom: 24 }}>
            <div className="stat"><div className="n">{rub(monthTotal)}</div><div className="l">в этом месяце · {monthReceipts.length} чеков</div></div>
            <div className="stat"><div className="n">{rub(totalAll)}</div><div className="l">всего · {receipts.length} чеков</div></div>
            <div className="stat"><div className="n">{rub(avg)}</div><div className="l">средний чек</div></div>
          </div>

          <div className="grid cols2" style={{ alignItems: "start", marginBottom: 24 }}>
            <div className="card pad">
              <h2 className="title" style={{ fontSize: 16, marginBottom: 14 }}>По категориям</h2>
              <div className="grid" style={{ gap: 12 }}>
                {byCategory.map(([cat, sum]) => (
                  <div key={cat}>
                    <div className="pmeta" style={{ marginBottom: 4, marginTop: 0 }}>
                      <span style={{ color: "var(--ink)" }}>{cat}</span>
                      <span style={{ fontWeight: 600 }}>{rub(sum)}</span>
                    </div>
                    <div className="pbar"><span style={{ width: `${(sum / catMax) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card pad">
              <h2 className="title" style={{ fontSize: 16, marginBottom: 14 }}>Топ магазинов</h2>
              <div className="grid" style={{ gap: 12 }}>
                {byMerchant.map(([mer, sum]) => (
                  <div key={mer}>
                    <div className="pmeta" style={{ marginBottom: 4, marginTop: 0 }}>
                      <span style={{ color: "var(--ink)" }}>{mer}</span>
                      <span style={{ fontWeight: 600 }}>{rub(sum)}</span>
                    </div>
                    <div className="pbar done"><span style={{ width: `${(sum / merMax) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card pad" style={{ marginBottom: 24 }}>
            <h2 className="title" style={{ fontSize: 16, marginBottom: 16 }}>По месяцам</h2>
            <div className="row" style={{ alignItems: "flex-end", gap: 14, height: 140 }}>
              {months.map((m) => (
                <div key={m.key} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 100, display: "flex", alignItems: "flex-end" }}>
                    <div title={rub(m.total)} style={{
                      width: "100%", borderRadius: "8px 8px 0 0",
                      height: `${(m.total / monthMax) * 100}%`, minHeight: m.total > 0 ? 4 : 0,
                      background: "linear-gradient(180deg, var(--primary), #7c74f0)",
                    }} />
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600 }}>{m.total > 0 ? rub(m.total) : "—"}</div>
                </div>
              ))}
            </div>
          </div>

          <h2 className="title" style={{ fontSize: 16, marginBottom: 12 }}>Последние чеки</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr><th>Дата</th><th>Магазин</th><th>Категория</th><th style={{ textAlign: "right" }}>Сумма</th></tr>
              </thead>
              <tbody>
                {receipts.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{fmtDate(r.purchasedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{r.merchant}</td>
                    <td><span className="st mut">{r.category}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{rub(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
