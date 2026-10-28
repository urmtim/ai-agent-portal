"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getCourse, pageNav } from "@/lib/courses";
import { hasAccess, markPageComplete } from "@/lib/progress";

/**
 * Marks the current lesson complete, then moves on: to the next lesson if
 * there is one, otherwise back to the course overview.
 */
export async function completeAndContinue(formData: FormData) {
  const user = await requireUser();
  const courseSlug = String(formData.get("courseSlug"));
  const pageSlug = String(formData.get("pageSlug"));

  const course = getCourse(courseSlug);
  if (!course || !(await hasAccess(user.id, courseSlug))) redirect("/");

  await markPageComplete(user.id, courseSlug, pageSlug);

  const { next } = pageNav(course, pageSlug);
  redirect(next ? `/courses/${courseSlug}/${next.slug}` : `/courses/${courseSlug}`);
}
