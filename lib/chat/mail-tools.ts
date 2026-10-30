import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { Connector } from "@prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import type { AuditChannel } from "@/lib/audit-events";
import { mailAccess } from "@/lib/connections";
import {
  MailUserError, attachmentText, countEmails, forwardEmail, listFolders, mailError, makeFolder, markEmails, moveEmails, readEmail, replyEmail,
  saveDraft, searchEmails, sendEmail, spamEmails, trashEmails, type MailFolder, type MailLetter, type MailSummary, type MoveResult,
} from "@/lib/mailbox";
import { maskDeep } from "@/lib/agents/guardrails";
import { letters } from "@/lib/mail-catalog";

// The «Почта» connector's tools — shared by the chat assistant and custom agents. Which of them the model gets
// is decided by the connector's «Инструменты» tab and its connection (lib/mail-catalog.ts); every one stays defined here
// so stored chats validate. Reading is masked by the «Маскирование ПДн» guardrail; changes and sends are journaled
// without the letters' text.

type Err = { error: string };
export type MailSearchResult = { mailbox: string; folder?: string; total: number; letters: MailSummary[] } | Err;
export type MailReadResult = { mailbox: string; letter: MailLetter } | Err;
export type MailCountResult = { mailbox: string; folder?: string; total: number; unread: number | null } | Err;
export type MailFoldersResult = { mailbox: string; folders: MailFolder[] } | Err;
export type MailAttachmentResult = { mailbox: string; folder: string; name: string; text: string } | Err;
/** A change or a send: what was done, in words. */
export type MailActionResult = { mailbox: string; done: string } | Err;

export type MailToolsOptions = {
  conn: Connector | null;
  /** Who acts, for the journal: «Ассистент», «Агент «Сводка»»… */
  who: string;
  actor: AuditActor;
  channel: AuditChannel;
  /** Personal data in letters replaced by labels before the model sees them (agent guardrail). */
  mask?: boolean;
  /** Error when there is no mailbox. */
  missing?: string;
  /** The tools that run only after the user confirmed them (chat HITL): their run is journaled as an approval. */
  approved?: (tool: string) => boolean;
};

const readable = (e: unknown) =>
  e instanceof MailUserError || (e instanceof Error && /не добавлена|не читается|не до конца/.test(e.message)) ? (e as Error).message : mailError(e);

const folder = z.string().max(200).optional().describe("Папка: название из mail_folders; по умолчанию «Входящие»");
const ids = z.array(z.number().int().positive()).min(1).max(50).describe("id писем из mail_search в этой папке");
const id = z.number().int().positive().describe("id письма из mail_search");
const moved = (r: MoveResult) => `${letters(r.count)} из «${r.from}» в «${r.to}»`;

export function mailTools({ conn, who, actor, channel, mask = false, missing = "Почта не добавлена", approved }: MailToolsOptions) {
  const mail = () => {
    if (!conn) throw new Error(missing);
    return mailAccess(conn);
  };
  const out = <T,>(v: T): T => (mask ? maskDeep(v) : v);
  const box = () => conn!.name;

  /** Runs a read; errors in words. */
  const reading = <T,>(fn: () => Promise<T>) => async (): Promise<T | Err> => {
    try { return await fn(); } catch (e) { return { error: readable(e) }; }
  };
  /** Runs a change or a send and journals it (and its approval, when it needed one). */
  const acting = (name: string, fn: () => Promise<string>) => async (): Promise<MailActionResult> => {
    try {
      const done = await fn();
      if (approved?.(name)) await audit("approval", `Подтверждено в «${box()}»: ${done}`, actor, channel);
      await audit("tool", `${who} в «${box()}»: ${done}`, actor, channel);
      return { mailbox: box(), done };
    } catch (e) {
      return { error: readable(e) };
    }
  };

  return {
    // ---- reading ----
    mail_search: tool({
      description: "Искать письма в папке (по умолчанию «Входящие»). Без запроса — последние письма за период. Возвращает id, дату, отправителя, тему и начало текста.",
      inputSchema: z.object({
        folder,
        query: z.string().max(200).optional().describe("Слова для поиска в теме, тексте или отправителе"),
        from: z.string().max(200).optional().describe("Часть адреса или имени отправителя"),
        days: z.number().int().min(1).max(90).describe("За сколько последних дней, обычно 1–7"),
        unreadOnly: z.boolean().optional().describe("Только непрочитанные"),
        limit: z.number().int().min(1).max(20).optional().describe("Сколько писем вернуть, по умолчанию 10"),
      }),
      execute: async (q): Promise<MailSearchResult> => reading(async () => {
        const r = await searchEmails(mail(), { ...q, limit: q.limit ?? 10 });
        await audit("tool", `${who} искал письма в «${box()}», «${r.folder}», за ${q.days} дн.: найдено ${r.total}`, actor, channel);
        return out({ mailbox: box(), ...r });
      })(),
    }),
    mail_read: tool({
      description: "Прочитать письмо целиком по id из mail_search, в той же папке. Письмо не помечается прочитанным. Вложения — номер, имя и размер.",
      inputSchema: z.object({ id, folder }),
      execute: async (q): Promise<MailReadResult> => reading(async () => {
        const letter = await readEmail(mail(), q.id, q.folder);
        if (!letter) throw new MailUserError("Такого письма нет — найдите его заново");
        await audit("tool", `${who} открыл письмо в «${box()}», «${letter.folder}»`, actor, channel);
        return out({ mailbox: box(), letter });
      })(),
    }),
    mail_attachment: tool({
      description: "Прочитать текст вложения письма по его номеру из mail_read: PDF, Word, текст, CSV, HTML.",
      inputSchema: z.object({ id, n: z.number().int().min(1).max(50).describe("Номер вложения из mail_read"), folder }),
      execute: async (q): Promise<MailAttachmentResult> => reading(async () => {
        const r = await attachmentText(mail(), q.id, q.n, q.folder);
        await audit("tool", `${who} прочитал вложение «${r.name}» в «${box()}»`, actor, channel);
        return out({ mailbox: box(), ...r });
      })(),
    }),
    mail_count: tool({
      description: "Сколько писем в папке (по умолчанию «Входящие»): всего и непрочитанных (по POP3 — только всего). Для вопросов «сколько писем» — без поиска.",
      inputSchema: z.object({ folder }),
      execute: async (q): Promise<MailCountResult> => reading(async () => {
        const r = await countEmails(mail(), q.folder);
        await audit("tool", `${who} посчитал письма в «${box()}», «${r.folder}»: всего ${r.total}${r.unread === null ? "" : `, непрочитанных ${r.unread}`}`, actor, channel);
        return { mailbox: box(), ...r };
      })(),
    }),
    mail_folders: tool({
      description: "Папки почты: название, сколько писем и непрочитанных. Служебные называются по-русски: Входящие, Отправленные, Черновики, Корзина, Спам, Архив.",
      inputSchema: z.object({}),
      execute: async (): Promise<MailFoldersResult> => reading(async () => {
        const folders = await listFolders(mail());
        await audit("tool", `${who} посмотрел папки «${box()}»: ${folders.length}`, actor, channel);
        return { mailbox: box(), folders };
      })(),
    }),

    // ---- changes: all of them can be undone inside the mailbox ----
    mail_move: tool({
      description: "Переместить письма в другую папку, например в «Архив» или обратно из «Корзины» во «Входящие».",
      inputSchema: z.object({ ids, folder, to: z.string().max(200).describe("Куда: название папки из mail_folders") }),
      execute: async (q) => acting("mail_move", async () => `перемещено ${moved(await moveEmails(mail(), q.ids, q.to, q.folder))}`)(),
    }),
    mail_mark: tool({
      description: "Отметить письма прочитанными или непрочитанными и/или поставить или снять флажок.",
      inputSchema: z.object({
        ids, folder,
        read: z.boolean().optional().describe("true — прочитано, false — не прочитано"),
        flagged: z.boolean().optional().describe("true — поставить флажок, false — снять"),
      }),
      execute: async (q) => acting("mail_mark", async () => {
        const r = await markEmails(mail(), q.ids, { read: q.read, flagged: q.flagged }, q.folder);
        const what = [q.read === true && "прочитано", q.read === false && "не прочитано", q.flagged === true && "флажок", q.flagged === false && "без флажка"].filter(Boolean).join(", ");
        return `${letters(r.count)} в «${r.folder}» отмечено: ${what}`;
      })(),
    }),
    mail_spam: tool({
      description: "Пометить письма спамом (переносит в «Спам») или вернуть из «Спама» во «Входящие».",
      inputSchema: z.object({ ids, folder, spam: z.boolean().describe("true — в спам, false — не спам, во «Входящие»") }),
      execute: async (q) => acting("mail_spam", async () => `${q.spam ? "в спам" : "не спам"}: ${moved(await spamEmails(mail(), q.ids, q.spam, q.folder))}`)(),
    }),
    mail_draft: tool({
      description: "Положить письмо в «Черновики», ничего не отправляя: новое или ответ на письмо (replyTo). Пользователь проверит и отправит сам.",
      inputSchema: z.object({
        to: z.string().max(500).optional().describe("Кому; для ответа можно не указывать"),
        cc: z.string().max(500).optional().describe("Копия"),
        subject: z.string().max(300).optional().describe("Тема; для ответа можно не указывать"),
        text: z.string().max(20000).describe("Текст письма"),
        replyTo: z.object({ id, folder, all: z.boolean().optional().describe("Ответить всем") }).optional().describe("Письмо, на которое это ответ"),
      }),
      execute: async (q) => acting("mail_draft", async () => {
        const r = await saveDraft(mail(), { ...q, reply: q.replyTo });
        return `черновик «${r.subject || "без темы"}»${r.to ? ` для ${r.to}` : ""} в «${r.folder}»`;
      })(),
    }),
    mail_folder: tool({
      description: "Создать папку или переименовать свою (rename — её нынешнее название). Служебные папки не переименовываются.",
      inputSchema: z.object({
        name: z.string().min(1).max(100).describe("Название новой папки или новое название"),
        rename: z.string().max(200).optional().describe("Какую папку переименовать"),
      }),
      execute: async (q) => acting("mail_folder", async () => {
        const r = await makeFolder(mail(), q.name, q.rename);
        return r.renamed ? `папка «${r.renamed}» переименована в «${r.name}»` : `создана папка «${r.name}»`;
      })(),
    }),
    mail_trash: tool({
      description: "Удалить письма в «Корзину». Насовсем не удаляет: из корзины их можно вернуть инструментом mail_move.",
      inputSchema: z.object({ ids, folder }),
      execute: async (q) => acting("mail_trash", async () => `в корзину: ${moved(await trashEmails(mail(), q.ids, q.folder))}`)(),
    }),

    // ---- sending: goes out and can't be undone ----
    mail_send: tool({
      description: "Отправить новое письмо от имени ящика пользователя.",
      inputSchema: z.object({
        to: z.string().min(3).max(500).describe("Кому, адреса через запятую"),
        cc: z.string().max(500).optional().describe("Копия"),
        subject: z.string().max(300).describe("Тема"),
        text: z.string().min(1).max(20000).describe("Текст письма"),
      }),
      execute: async (q) => acting("mail_send", async () => { const r = await sendEmail(mail(), q); return `отправлено письмо «${r.subject}» для ${r.to}`; })(),
    }),
    mail_reply: tool({
      description: "Ответить на письмо: отправителю или всем, с темой «Re: » и цитатой исходного.",
      inputSchema: z.object({ id, folder, text: z.string().min(1).max(20000).describe("Текст ответа"), all: z.boolean().optional().describe("Ответить всем") }),
      execute: async (q) => acting("mail_reply", async () => { const r = await replyEmail(mail(), q.id, q.text, !!q.all, q.folder); return `отправлен ответ «${r.subject}» для ${r.to}`; })(),
    }),
    mail_forward: tool({
      description: "Переслать письмо с его вложениями, с темой «Fwd: ».",
      inputSchema: z.object({ id, folder, to: z.string().min(3).max(500).describe("Кому"), text: z.string().max(20000).optional().describe("Свой текст над пересланным") }),
      execute: async (q) => acting("mail_forward", async () => {
        const r = await forwardEmail(mail(), q.id, q.to, q.text ?? "", q.folder);
        return `переслано письмо «${r.subject}» для ${r.to}${r.attachments ? `, вложений: ${r.attachments}` : ""}`;
      })(),
    }),
  };
}

export type MailTools = ReturnType<typeof mailTools>;
