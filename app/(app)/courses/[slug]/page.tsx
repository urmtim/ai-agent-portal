import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCourse } from "@/lib/courses";
import { courseProgress, hasAccess } from "@/lib/progress";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();
  const course = getCourse(slug);
  if (!course) notFound();

  if (!(await hasAccess(user.id, slug))) {
    return (
      <div className="narrow" style={{ margin: "0 auto" }}>
        <Link href="/" className="back">← Мои курсы</Link>
        <div className="card pad">
          <h1 className="title">Нет доступа</h1>
          <p className="lead">
            У вас пока нет доступа к курсу «{course.title}». Обратитесь к администратору.
          </p>
        </div>
      </div>
    );
  }

  const progress = await courseProgress(user.id, course);
  const firstUnfinished =
    course.pages.find((p) => !progress.completed.has(p.slug)) ?? course.pages[0];

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <Link href="/" className="back">← Мои курсы</Link>

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
          <div className="course" style={{ padding: 0, border: 0, boxShadow: "none", flex: 1 }}>
            <div className="row" style={{ gap: 14 }}>
              <span className="emoji" style={{ fontSize: 28 }}>{course.emoji}</span>
              <div>
                <h1 className="title">{course.title}</h1>
                <p className="lead">{course.description}</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className={`pbar ${progress.percent === 100 ? "done" : ""}`}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="pmeta">
            <span>{progress.done} из {progress.total} уроков</span>
            <span>{progress.percent}%</span>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <Link href={`/courses/${slug}/${firstUnfinished.slug}`} className="btn primary">
            {progress.done === 0
              ? "Начать курс"
              : progress.percent === 100
                ? "Повторить"
                : "Продолжить"}
          </Link>
        </div>
      </div>

      <h2 className="title" style={{ marginBottom: 12 }}>Программа</h2>
      <div className="card">
        <table>
          <tbody>
            {course.pages.map((p, i) => {
              const done = progress.completed.has(p.slug);
              return (
                <tr key={p.slug} className="clk">
                  <td style={{ width: 44, textAlign: "center" }}>
                    {done ? (
                      <span style={{ color: "var(--ok)", fontSize: 17 }}>✓</span>
                    ) : (
                      <span className="muted">{i + 1}</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/courses/${slug}/${p.slug}`} style={{ fontWeight: 600 }}>
                      {p.title}
                    </Link>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {done && <span className="st ok">пройден</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
