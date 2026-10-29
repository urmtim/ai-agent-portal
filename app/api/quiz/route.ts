import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCourse, getQuiz } from "@/lib/courses";
import { hasAccess } from "@/lib/progress";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  courseSlug: z.string(),
  pageSlug: z.string(),
  quizId: z.string(),
  answers: z.record(z.string(), z.array(z.number().int())),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { courseSlug, pageSlug, quizId, answers } = parsed.data;

  if (!(await hasAccess(userId, courseSlug))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const found = getQuiz(courseSlug, quizId);
  if (!found) {
    return NextResponse.json({ error: "quiz not found" }, { status: 404 });
  }
  const { quiz, passThreshold } = found;

  // Grade server-side. A question is correct only if the selected set of
  // options exactly matches the correct set (works for single and multiple).
  let score = 0;
  const correct: Record<string, number[]> = {};
  const explanations: Record<string, string> = {};
  for (const q of quiz.questions) {
    correct[q.id] = q.correct;
    if (q.explanation) explanations[q.id] = q.explanation;

    const selected = [...new Set(answers[q.id] ?? [])].sort((a, b) => a - b);
    const want = [...q.correct].sort((a, b) => a - b);
    const isCorrect =
      selected.length === want.length && selected.every((v, i) => v === want[i]);
    if (isCorrect) score++;
  }
  const total = quiz.questions.length;
  const passed = total > 0 && (score / total) * 100 >= passThreshold;

  await prisma.quizResult.create({
    data: {
      userId,
      courseSlug,
      pageSlug,
      quizId,
      score,
      total,
      passed,
      answers: JSON.stringify(answers),
    },
  });
  await audit("learning", `Тест в курсе «${getCourse(courseSlug)?.title ?? courseSlug}»: ${score} из ${total}, ${passed ? "сдан" : "не сдан"}`, session.user);

  return NextResponse.json({ score, total, passed, correct, explanations });
}
