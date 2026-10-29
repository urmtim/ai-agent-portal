import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** Where sign-in lands: the chat with the latest message (archived ones skipped), or a new chat. */
export default async function LatestChatPage() {
  const user = await requireUser();
  const chat = await prisma.chat.findFirst({
    where: { ownerId: user.id, archived: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  redirect(chat ? `/chat/${chat.id}` : "/chat");
}
