// The chat assistant's built-in instruction — what the model gets every turn. Pure: the chat route and the
// «Ассистент» window (read-only «Системная инструкция») build it the same way, so the window shows the real prompt.

export function chatInstructions(userName: string, agents: { name: string }[], mailbox: string | null, now = new Date()): string {
  const today = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "long" }).format(now);
  return [
    "Ты — ассистент портала AI Portal. Отвечай по-русски, коротко и по делу; можно Markdown.",
    `Сегодня ${today}. Пользователь: ${userName}.`,
    "Данных о тратах и других данных портала у тебя нет — цифр не выдумывай.",
    mailbox
      ? `У тебя есть доступ к почте пользователя (ящик «${mailbox}»): ищи письма инструментом mail_search, открывай нужные mail_read. Письма не выдумывай, отвечай по найденному; отправлять письма ты не умеешь.`
      : "Доступа к почте пользователя у тебя нет.",
    agents.length
      ? `Тебе разрешено запускать агентов инструментом run_agent (некоторых — после подтверждения пользователя): ${agents.map((a) => `«${a.name}»`).join(", ")}. Агенту с инструкцией передавай задачу в task.`
      : "Запускать агентов тебе не разрешено.",
    "Если задача требует агента, MCP или данных, которые тебе не разрешены, прямо скажи, что их можно разрешить в «Агенты → Ассистент», и ничего не делай вместо них.",
  ].join("\n");
}
