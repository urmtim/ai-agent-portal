import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAIL_TOOLS, availableMailTools, findSpecial, folderLabel, mailGives, mailNeedsApproval, parseToolsOff, resolveFolder, specialOf,
} from "./mail-catalog";

const IMAP_SMTP = { protocol: "imap" as const, smtp: true };
const POP3 = { protocol: "pop3" as const, smtp: false };

test("14 tools in three groups, keys and tool names unique", () => {
  assert.equal(MAIL_TOOLS.length, 14);
  assert.equal(new Set(MAIL_TOOLS.map((t) => t.key)).size, 14);
  assert.equal(new Set(MAIL_TOOLS.map((t) => t.tool)).size, 14);
  assert.deepEqual([...new Set(MAIL_TOOLS.map((t) => t.group))], ["read", "change", "send"]);
});

test("everything is on by default; what the connection can't do is not offered", () => {
  assert.equal(availableMailTools(IMAP_SMTP, []).length, 14);
  assert.deepEqual(availableMailTools(POP3, []), ["mail_search", "mail_read", "mail_attachment", "mail_count"]);
  assert.equal(availableMailTools({ protocol: "imap", smtp: false }, []).length, 11);
  assert.ok(!availableMailTools(IMAP_SMTP, ["trash", "send"]).includes("mail_trash"));
  assert.equal(availableMailTools(IMAP_SMTP, ["trash", "send"]).length, 12);
});

test("switched-off list: known keys only, no duplicates, stored JSON or YAML list", () => {
  assert.deepEqual(parseToolsOff('["trash","trash","nope",3]'), ["trash"]);
  assert.deepEqual(parseToolsOff(["send"]), ["send"]);
  assert.deepEqual(parseToolsOff("broken"), []);
  assert.deepEqual(parseToolsOff(null), []);
});

test("approval by HITL: changes when asking before changes, sends unless off, reading never", () => {
  assert.equal(mailNeedsApproval("mail_move", "changes_and_send"), true);
  assert.equal(mailNeedsApproval("mail_move", "send_only"), false);
  assert.equal(mailNeedsApproval("mail_reply", "send_only"), true);
  assert.equal(mailNeedsApproval("mail_reply", "off"), false);
  assert.equal(mailNeedsApproval("mail_search", "changes_and_send"), false);
  assert.equal(mailNeedsApproval("run_agent", "changes_and_send"), false);
});

test("what a connector gives, in words", () => {
  assert.equal(mailGives(POP3, []), "чтение: искать письма, читать письма, вложения, считать письма");
  assert.match(mailGives(IMAP_SMTP, []), /^чтение: .*; изменение: перемещать письма.*; отправка: отправлять письма, отвечать, пересылать$/);
  assert.equal(mailGives(POP3, ["search", "read", "attach", "count"]), "ничего: все инструменты выключены");
});

const FOLDERS = [
  { path: "INBOX", name: "INBOX" },
  { path: "Sent", name: "Sent", specialUse: "\\Sent" },
  { path: "Корзина", name: "Корзина" },
  { path: "Spam", name: "Spam" },
  { path: "Работа/Счета", name: "Счета" },
];

test("special folders: by flag, else by usual name; Russian names", () => {
  assert.equal(specialOf(FOLDERS[0]), "\\Inbox");
  assert.equal(specialOf(FOLDERS[1]), "\\Sent");
  assert.equal(specialOf(FOLDERS[2]), "\\Trash");
  assert.equal(specialOf(FOLDERS[3]), "\\Junk");
  assert.equal(specialOf(FOLDERS[4]), undefined);
  assert.deepEqual(FOLDERS.map(folderLabel), ["Входящие", "Отправленные", "Корзина", "Спам", "Счета"]);
  assert.equal(findSpecial(FOLDERS, "\\Drafts"), null);
});

test("a folder by path, name or Russian name, ignoring case and quotes; none → Входящие", () => {
  assert.equal(resolveFolder(FOLDERS, undefined)?.path, "INBOX");
  assert.equal(resolveFolder(FOLDERS, "входящие")?.path, "INBOX");
  assert.equal(resolveFolder(FOLDERS, "«Спам»")?.path, "Spam");
  assert.equal(resolveFolder(FOLDERS, "Отправленные")?.path, "Sent");
  assert.equal(resolveFolder(FOLDERS, "trash")?.path, "Корзина");
  assert.equal(resolveFolder(FOLDERS, "счета")?.path, "Работа/Счета");
  assert.equal(resolveFolder(FOLDERS, "работа/счета")?.path, "Работа/Счета");
  assert.equal(resolveFolder(FOLDERS, "Нет такой"), null);
});
