import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getAllCourses } from "@/lib/courses";
import { courseProgress, getAccessSlugs } from "@/lib/progress";

export default async function HomePage() {
  const user = await requireUser();
  const accessSlugs = new Set(await getAccessSlugs(user.id));
  const courses = getAllCourses().filter((c) => accessSlugs.has(c.slug));

  const withProgress = await Promise.all(
    courses.map(async (c) => ({ course: c, progress: await courseProgress(user.id, c) })),
  );

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">Мои курсы</h1>
          <p className="lead">Курсы, к которым вам открыт доступ</p>
        </div>
      </div>

      {withProgress.length === 0 ? (
        <div className="card empty">
          Вам пока не выдали ни одного курса. Доступ открывает администратор.
        </div>
      ) : (
        <div className="grid cols3">
          {withProgress.map(({ course, progress }) => (
            <Link key={course.slug} href={`/courses/${course.slug}`} className="course">
              <span className="emoji">{course.emoji}</span>
              <div>
                <h3>{course.title}</h3>
              </div>
              <p className="desc">{course.description}</p>
              <div>
                <div className={`pbar ${progress.percent === 100 ? "done" : ""}`}>
                  <span style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="pmeta">
                  <span>
                    {progress.done} / {progress.total} уроков
                  </span>
                  <span>{progress.percent}%</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
