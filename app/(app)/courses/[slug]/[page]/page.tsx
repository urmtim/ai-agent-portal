import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { requireUser } from "@/lib/session";
import { getCourse, getPageSource, getPublicQuiz, pageNav } from "@/lib/courses";
import { getCompletedPages, hasAccess } from "@/lib/progress";
import { Quiz } from "@/components/mdx/Quiz";
import { completeAndContinue } from "@/app/actions/progress";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; page: string }>;
}) {
  const { slug, page } = await params;
  const user = await requireUser();

  const course = getCourse(slug);
  if (!course) notFound();
  if (!(await hasAccess(user.id, slug))) notFound();

  const source = getPageSource(slug, page);
  if (source === null) notFound();

  const { current, prev, next, index } = pageNav(course, page);
  const completed = await getCompletedPages(user.id, slug);
  const isDone = completed.has(page);

  const quiz = current?.quizId ? getPublicQuiz(slug, current.quizId) : null;

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <Link href={`/courses/${slug}`} className="back">← {course.title}</Link>

      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
        Урок {index + 1} из {course.pages.length}
        {isDone && <span className="st ok" style={{ marginLeft: 10 }}>пройден</span>}
      </div>

      <article className="card pad prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {source}
        </ReactMarkdown>

        {quiz && (
          <Quiz
            courseSlug={slug}
            pageSlug={page}
            quizId={quiz.id}
            questions={quiz.questions}
            passThreshold={quiz.passThreshold}
          />
        )}
      </article>

      <div
        className="row"
        style={{ justifyContent: "space-between", marginTop: 22, gap: 12, flexWrap: "wrap" }}
      >
        {prev ? (
          <Link href={`/courses/${slug}/${prev.slug}`} className="btn ghost">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}

        <form action={completeAndContinue}>
          <input type="hidden" name="courseSlug" value={slug} />
          <input type="hidden" name="pageSlug" value={page} />
          <button className="btn primary" type="submit">
            {next ? "Пройдено, дальше →" : "Пройдено, завершить курс"}
          </button>
        </form>
      </div>

      {isDone && next && (
        <div style={{ textAlign: "right", marginTop: 10 }}>
          <Link href={`/courses/${slug}/${next.slug}`} className="muted" style={{ fontSize: 13 }}>
            перейти к «{next.title}» без отметки →
          </Link>
        </div>
      )}
    </div>
  );
}
