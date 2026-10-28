import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getAllCourses } from "@/lib/courses";
import { toggleAccess } from "../actions";

export default async function AdminAccessPage() {
  await requireAdmin();

  const [users, accessRows] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.courseAccess.findMany(),
  ]);
  const courses = getAllCourses();
  const granted = new Set(accessRows.map((a) => `${a.userId}:${a.courseSlug}`));

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Доступы к курсам</h1>
          <p className="lead">Отметьте, какие курсы открыты каждому пользователю</p>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="card empty">Сначала заведите пользователей.</div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Пользователь</th>
                {courses.map((c) => (
                  <th key={c.slug} style={{ textAlign: "center" }}>
                    {c.emoji} {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div className="sub">{u.email}</div>
                  </td>
                  {courses.map((c) => {
                    const on = granted.has(`${u.id}:${c.slug}`);
                    return (
                      <td key={c.slug} style={{ textAlign: "center" }}>
                        <form action={toggleAccess} style={{ display: "inline" }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="courseSlug" value={c.slug} />
                          <input type="hidden" name="grant" value={on ? "0" : "1"} />
                          <button
                            type="submit"
                            title={on ? "Открыт — нажмите, чтобы закрыть" : "Закрыт — нажмите, чтобы открыть"}
                            className="btn sm"
                            style={
                              on
                                ? { background: "var(--primary)", color: "#fff", minWidth: 44 }
                                : { background: "var(--card)", border: "1px solid var(--line)", color: "var(--muted)", minWidth: 44 }
                            }
                          >
                            {on ? "✓" : "+"}
                          </button>
                        </form>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
