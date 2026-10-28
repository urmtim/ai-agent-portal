import "server-only";
import { prisma } from "@/lib/db";
import type { CourseMeta } from "@/lib/courses";

/** Course slugs the user has access to. */
export async function getAccessSlugs(userId: string): Promise<string[]> {
  const rows = await prisma.courseAccess.findMany({
    where: { userId },
    select: { courseSlug: true },
  });
  return rows.map((r) => r.courseSlug);
}

export async function hasAccess(userId: string, courseSlug: string): Promise<boolean> {
  const row = await prisma.courseAccess.findUnique({
    where: { userId_courseSlug: { userId, courseSlug } },
  });
  return !!row;
}

/** Set of completed page slugs for a course. */
export async function getCompletedPages(
  userId: string,
  courseSlug: string,
): Promise<Set<string>> {
  const rows = await prisma.progress.findMany({
    where: { userId, courseSlug },
    select: { pageSlug: true },
  });
  return new Set(rows.map((r) => r.pageSlug));
}

export type CourseProgress = {
  done: number;
  total: number;
  percent: number;
  completed: Set<string>;
};

export async function courseProgress(
  userId: string,
  course: CourseMeta,
): Promise<CourseProgress> {
  const completed = await getCompletedPages(userId, course.slug);
  const total = course.pages.length;
  const done = course.pages.filter((p) => completed.has(p.slug)).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    completed,
  };
}

export async function markPageComplete(
  userId: string,
  courseSlug: string,
  pageSlug: string,
): Promise<void> {
  await prisma.progress.upsert({
    where: { userId_courseSlug_pageSlug: { userId, courseSlug, pageSlug } },
    update: {},
    create: { userId, courseSlug, pageSlug },
  });
}
