import type { UIMessage } from "ai";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadChatScreen } from "../data";
import { ChatScreen } from "../ChatScreen";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const chat = await prisma.chat.findUnique({ where: { id } });
  if (!chat || chat.ownerId !== user.id) notFound();
  const data = await loadChatScreen(user.id);
  return (
    <ChatScreen key={chat.id} {...data} chatId={chat.id} saved title={chat.title}
      initialMessages={JSON.parse(chat.messages) as UIMessage[]} />
  );
}
