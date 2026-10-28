import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getAllCourses, getCourse } from "@/lib/courses";
import { courseProgress, getAccessSlugs } from "@/lib/progress";

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

type Ev = { when: Date; title: string; sub: string; ok: boolean };

export default async function MePage() {
  const user = await requireUser();

  const accessSlugs = new Set(await getAccessSlugs(user.id));
  const courses = getAllCourses().filter((c) => accessSlugs.has(c.slug));
  const withProgress = await Promise.all(
    courses.map(async (c) => ({ course: c, progress: await courseProgress(user.id, c) })),
  );

  const [progressRows, quizRows] = await Promise.all([
    prisma.progress.findMany({ where: { userId: user.id }, orderBy: { completedAt: "desc" } }),
    prisma.quizResult.findMany({ where: { userId: user.id }, orderBy: { submittedAt: "desc" } }),
  ]);

  const lessonsDone = progressRows.length;
  const quizzesPassed = quizRows.filter((q) => q.passed).length;

  // Build an activity timeline from lessons + quiz attempts.
  const events: Ev[] = [
    ...progressRows.map((r): Ev => {
      const course = getCourse(r.courseSlug);
      const page = course?.pages.find((p) => p.slug === r.pageSlug);
      return {
        when: r.completedAt,
        title: `Урок пройден: ${page?.title ?? r.pageSlug}`,
        sub: course?.title ?? r.courseSlug,
        ok: true,
      };
    }),
    ...quizRows.map((r): Ev => {
      const course = getCourse(r.courseSlug);
      return {
        when: r.submittedAt,
        title: `Тест — ${r.score}/${r.total} (${r.passed ? "зачёт" : "не сдано"})`,
        sub: course?.title ?? r.courseSlug,
        ok: r.passed,
      };
    }),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 14);

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Мой прогресс</h1>
          <p className="lead">Личный дневник обучения</p>
        </div>
      </div>

      <div className="grid cols3" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="n">{courses.length}</div>
          <div className="l">курсов в доступе</div>
        </div>
        <div className="stat">
          <div className="n">{lessonsDone}</div>
          <div className="l">уроков пройдено</div>
        </div>
        <div className="stat">
          <div className="n">{quizzesPassed}</div>
          <div className="l">тестов сдано</div>
        </div>
      </div>

      <div className="grid cols2" style={{ alignItems: "start" }}>
        <div>
          <h2 className="title" style={{ marginBottom: 12 }}>Курсы</h2>
          {withProgress.length === 0 ? (
            <div className="card empty">Пока нет открытых курсов.</div>
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              {withProgress.map(({ course, progress }) => (
                <Link key={course.slug} href={`/courses/${course.slug}`} className="card pad">
                  <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                    <span className="emoji" style={{ width: 38, height: 38, fontSize: 20 }}>
                      {course.emoji}
                    </span>
                    <div style={{ fontWeight: 700 }}>{course.title}</div>
                    <span className="spacer" />
                    <span className="muted" style={{ fontSize: 13 }}>{progress.percent}%</span>
                  </div>
                  <div className={`pbar ${progress.percent === 100 ? "done" : ""}`}>
                    <span style={{ width: `${progress.percent}%` }} />
                  </div>
                  <div className="pmeta">
                    <span>{progress.done} / {progress.total} уроков</span>
                    {progress.percent === 100 && <span className="st ok">курс завершён</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="title" style={{ marginBottom: 12 }}>Активность</h2>
          <div className="card pad">
            {events.length === 0 ? (
              <div className="muted" style={{ fontSize: 14 }}>
                Пока пусто. Начните любой курс — события появятся здесь.
              </div>
            ) : (
              <ul className="timeline">
                {events.map((e, i) => (
                  <li key={i} className={e.ok ? "ok" : ""}>
                    <span className="dot" />
                    <div className="tt">{e.title}</div>
                    <div className="ts">{e.sub} · {fmt(e.when)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
