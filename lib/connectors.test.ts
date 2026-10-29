import { test } from "node:test";
import assert from "node:assert/strict";
import { isConnectorKind, mailConfigFromForm, parseMailConfig, presetFor } from "./connectors";

test("catalog knows only its connectors", () => {
  assert.equal(isConnectorKind("mail"), true);
  assert.equal(isConnectorKind("toString"), false);
  assert.equal(isConnectorKind("hh"), false);
});

test("preset fills the server; «other» takes it from the form", () => {
  assert.deepEqual(mailConfigFromForm({ preset: "mailru", host: "ignored", port: "1", secure: false, user: " me@mail.ru " }),
    { host: "imap.mail.ru", port: 993, user: "me@mail.ru", secure: true });
  assert.deepEqual(mailConfigFromForm({ preset: "other", host: "IMAP.Example.org", port: "143", secure: false, user: "u" }),
    { host: "imap.example.org", port: 143, user: "u", secure: false });
  assert.deepEqual(mailConfigFromForm({ preset: "other", host: "127.0.0.1", port: "3143", secure: false, user: "u" }).valueOf(),
    { host: "127.0.0.1", port: 3143, user: "u", secure: false });
});

test("form errors are human-readable", () => {
  assert.match(String(mailConfigFromForm({ preset: "other", host: "not a host", port: "993", secure: true, user: "u" })), /адрес почтового сервера/);
  assert.match(String(mailConfigFromForm({ preset: "other", host: "imap.x.ru", port: "99999", secure: true, user: "u" })), /Порт/);
  assert.match(String(mailConfigFromForm({ preset: "yandex", host: "", port: "", secure: true, user: " " })), /логин/);
});

test("stored settings round-trip and junk is rejected", () => {
  assert.deepEqual(parseMailConfig('{"host":"imap.mail.ru","port":993,"user":"me@mail.ru"}'), { host: "imap.mail.ru", port: 993, user: "me@mail.ru", secure: true });
  assert.equal(parseMailConfig("{bad"), null);
  assert.equal(parseMailConfig('{"host":"x","port":0,"user":"u"}'), null);
  assert.equal(presetFor("IMAP.yandex.ru"), "yandex");
  assert.equal(presetFor("imap.example.org"), "other");
});
