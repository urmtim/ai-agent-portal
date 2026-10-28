import "server-only";
import fs from "fs";
import path from "path";

// ----- types -----

export type CoursePage = {
  slug: string;
  title: string;
  file: string;
  quizId?: string; // quiz shown after the lesson body, resolved from course.quizzes
};

export type QuizQuestion = {
  id: string;
  text: string;
  options: string[];
  // Correct option indices — SERVER ONLY, never sent to the client.
  // One entry for single-answer, several for multiple-answer questions.
  correct: number[];
  multi: boolean; // true -> checkboxes (several correct), false -> radio
  explanation?: string;
};

export type Quiz = {
  passThreshold?: number; // percent, defaults to course passThreshold
  questions: QuizQuestion[];
};

// Tolerate the older single-answer shape (`correct: number`, no `multi`).
function normalizeQuestion(raw: unknown): QuizQuestion {
  const q = raw as Record<string, unknown>;
  const correct = Array.isArray(q.correct) ? (q.correct as number[]) : [q.correct as number];
  return {
    id: String(q.id),
    text: String(q.text),
    options: (q.options as string[]) ?? [],
    correct,
    multi: typeof q.multi === "boolean" ? q.multi : correct.length > 1,
    explanation: typeof q.explanation === "string" ? q.explanation : undefined,
  };
}

function normalizeQuiz(raw: Quiz): Quiz {
  return { passThreshold: raw.passThreshold, questions: raw.questions.map(normalizeQuestion) };
}

export type CourseMeta = {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  passThreshold: number; // percent needed to "pass" a quiz / course
  pages: CoursePage[];
  quizzes: Record<string, Quiz>;
};

// Public shape handed to the client (no correct answers, no explanations).
export type PublicQuiz = {
  id: string;
  passThreshold: number;
  questions: { id: string; text: string; options: string[]; multi: boolean }[];
};

const COURSES_DIR = path.join(process.cwd(), "content", "courses");

// ----- reading -----

function readCourseJson(slug: string): CourseMeta | null {
  const file = path.join(COURSES_DIR, slug, "course.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: raw.title ?? slug,
    description: raw.description ?? "",
    emoji: raw.emoji ?? "📘",
    passThreshold: raw.passThreshold ?? 70,
    pages: raw.pages ?? [],
    quizzes: raw.quizzes ?? {},
  };
}

/** All courses defined under content/courses. */
export function getAllCourses(): CourseMeta[] {
  if (!fs.existsSync(COURSES_DIR)) return [];
  return fs
    .readdirSync(COURSES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readCourseJson(d.name))
    .filter((c): c is CourseMeta => c !== null);
}

export function getCourse(slug: string): CourseMeta | null {
  return readCourseJson(slug);
}

/** Raw MDX source for a given page. */
export function getPageSource(slug: string, pageSlug: string): string | null {
  const course = getCourse(slug);
  const page = course?.pages.find((p) => p.slug === pageSlug);
  if (!course || !page) return null;
  const file = path.join(COURSES_DIR, slug, page.file);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

/** Public quiz (no correct answers) for rendering. */
export function getPublicQuiz(slug: string, quizId: string): PublicQuiz | null {
  const course = getCourse(slug);
  const raw = course?.quizzes[quizId];
  if (!course || !raw) return null;
  const quiz = normalizeQuiz(raw);
  return {
    id: quizId,
    passThreshold: quiz.passThreshold ?? course.passThreshold,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      options: q.options,
      multi: q.multi,
    })),
  };
}

/** Full quiz (with answers) — server-side grading only. */
export function getQuiz(slug: string, quizId: string): { quiz: Quiz; passThreshold: number } | null {
  const course = getCourse(slug);
  const raw = course?.quizzes[quizId];
  if (!course || !raw) return null;
  const quiz = normalizeQuiz(raw);
  return { quiz, passThreshold: quiz.passThreshold ?? course.passThreshold };
}

/** Navigation helpers within a course. */
export function pageNav(course: CourseMeta, pageSlug: string) {
  const index = course.pages.findIndex((p) => p.slug === pageSlug);
  return {
    index,
    current: course.pages[index],
    prev: index > 0 ? course.pages[index - 1] : null,
    next: index < course.pages.length - 1 ? course.pages[index + 1] : null,
  };
}
