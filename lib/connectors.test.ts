import { test } from "node:test";
import assert from "node:assert/strict";
import { apiCheckMessage, apiConfigFromForm, isConnectorKind, mailConfigFromForm, parseApiConfig, parseMailConfig, switchProtocol } from "./connectors";

const form = (o: Partial<Record<"protocol" | "host" | "port" | "smtpHost" | "smtpPort" | "user", string>> = {}) =>
  ({ protocol: "imap", host: "imap.mail.ru", port: "993", smtpHost: "smtp.mail.ru", smtpPort: "465", user: "me@mail.ru", ...o });

test("only mail and API", () => {
  assert.equal(isConnectorKind("mail"), true);
  assert.equal(isConnectorKind("api"), true);
  assert.equal(isConnectorKind("toString"), false);
  assert.equal(isConnectorKind("tg"), false);
});

test("mail form: SSL follows the port", () => {
  assert.deepEqual(mailConfigFromForm(form({ host: " IMAP.Mail.ru ", user: " me@mail.ru " })),
    { protocol: "imap", host: "imap.mail.ru", port: 993, secure: true, user: "me@mail.ru", smtpHost: "smtp.mail.ru", smtpPort: 465, smtpSecure: true });
  assert.deepEqual(mailConfigFromForm(form({ protocol: "pop3", host: "127.0.0.1", port: "3110", smtpHost: "", smtpPort: "" })),
    { protocol: "pop3", host: "127.0.0.1", port: 3110, secure: false, user: "me@mail.ru", smtpHost: "", smtpPort: 465, smtpSecure: true });
});

test("mail form: the first problem from the top, with its field", () => {
  assert.deepEqual(mailConfigFromForm(form({ host: "", port: "", user: "" })), { field: "host", error: "Укажите сервер входящей почты" });
  assert.deepEqual(mailConfigFromForm(form({ port: "" })), { field: "port", error: "Укажите порт" });
  assert.equal((mailConfigFromForm(form({ port: "99999" })) as { field: string }).field, "port");
  assert.equal((mailConfigFromForm(form({ smtpHost: "not a host" })) as { field: string }).field, "smtpHost");
  assert.deepEqual(mailConfigFromForm(form({ user: " " })), { field: "user", error: "Укажите логин" });
});

test("stored mail settings: old IMAP rows still read", () => {
  assert.deepEqual(parseMailConfig('{"host":"imap.mail.ru","port":993,"secure":true,"user":"me@mail.ru"}'),
    { protocol: "imap", host: "imap.mail.ru", port: 993, secure: true, user: "me@mail.ru", smtpHost: "", smtpPort: 465, smtpSecure: true });
  assert.equal(parseMailConfig('{"host":"127.0.0.1","port":3143,"secure":false,"user":"me"}')?.secure, false);
  assert.equal(parseMailConfig('{"protocol":"pop3","host":"pop.x.ru","port":995,"user":"u"}')?.protocol, "pop3");
  assert.equal(parseMailConfig("{bad"), null);
  assert.equal(parseMailConfig('{"host":"x","port":0,"user":"u"}'), null);
});

test("API: address required, http(s) only", () => {
  assert.deepEqual(apiConfigFromForm({ url: " https://api.x.ru/v1 " }), { url: "https://api.x.ru/v1" });
  assert.deepEqual(apiConfigFromForm({ url: "" }), { field: "url", error: "Укажите адрес API" });
  assert.equal((apiConfigFromForm({ url: "api.x.ru" }) as { error: string }).error, "Адрес должен начинаться с http:// или https://");
  assert.deepEqual(parseApiConfig('{"url":"https://a.ru"}'), { url: "https://a.ru" });
  assert.equal(parseApiConfig("{}"), null);
});

test("IMAP ↔ POP3 switches port and the usual server name", () => {
  assert.deepEqual(switchProtocol("imap.mail.ru", "pop3"), { host: "pop.mail.ru", port: 995 });
  assert.deepEqual(switchProtocol("pop.mail.ru", "imap"), { host: "imap.mail.ru", port: 993 });
  assert.deepEqual(switchProtocol("mail.myhost.ru", "pop3"), { host: "mail.myhost.ru", port: 995 });
});

test("API check answers", () => {
  assert.deepEqual(apiCheckMessage(200), { ok: true, message: "✓ Подключено" });
  assert.deepEqual(apiCheckMessage(401), { ok: false, message: "✕ Неверный токен" });
  assert.deepEqual(apiCheckMessage(500), { ok: false, message: "✕ Сервер ответил 500" });
  assert.deepEqual(apiCheckMessage(null), { ok: false, message: "✕ Сервер не отвечает" });
});
