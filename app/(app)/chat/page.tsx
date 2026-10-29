import { generateId } from "ai";
import { requireUser } from "@/lib/session";
import { loadChatScreen } from "./data";
import { ChatScreen } from "./ChatScreen";

export default async function NewChatPage() {
  const user = await requireUser();
  const data = await loadChatScreen(user.id);
  // a fresh id per visit, so "+ Новый чат" always starts clean
  const id = generateId();
  return <ChatScreen key={id} {...data} chatId={id} saved={false} title="" initialMessages={[]} />;
}
