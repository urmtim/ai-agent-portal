import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FIELDS, fieldsToYaml, yamlToFields, type ConnectorFields } from "./connector-spec";

const mail: ConnectorFields = { ...EMPTY_FIELDS, name: "Моя почта", description: "Чеки", protocol: "pop3", host: "pop.mail.ru", port: "995", smtpHost: "smtp.mail.ru", smtpPort: "465", user: "me@mail.ru" };

test("mail connector round-trips; no secrets in the text", () => {
  const y = fieldsToYaml(mail);
  assert.ok(y.includes("type: mail") && y.includes("protocol: pop3") && y.includes("port: 995") && y.includes("user: me@mail.ru"), y);
  assert.ok(!/password|token/.test(y.replace("Пароли и токены", "")));
  const back = yamlToFields(y, EMPTY_FIELDS, false);
  assert.ok("fields" in back);
  assert.deepEqual(back.fields, mail);
  assert.deepEqual(back.warnings, []);
});

test("API connector round-trips; a new one may change type from the file", () => {
  const api: ConnectorFields = { ...EMPTY_FIELDS, kind: "api", name: "Курсы", url: "https://api.x.ru/v1", enabled: false };
  const y = fieldsToYaml(api);
  assert.ok(y.includes("type: api") && y.includes("url: https://api.x.ru/v1") && y.includes("enabled: false") && !y.includes("incoming"), y);
  const back = yamlToFields(y, EMPTY_FIELDS, false);
  assert.ok("fields" in back && back.fields.kind === "api" && back.fields.url === "https://api.x.ru/v1" && back.fields.enabled === false);
});

test("a saved connector keeps its type; secrets in the file are ignored", () => {
  const r = yamlToFields("type: api\nurl: https://a.ru\ntoken: abc\nname: X\n", mail, true);
  assert.ok("fields" in r);
  assert.equal(r.fields.kind, "mail");
  assert.equal(r.fields.name, "X");
  assert.deepEqual(r.warnings, ["Тип сохранённого коннектора не меняется — остаётся прежний", "Пароль и токен из файла не берутся — впишите их на вкладке «Подключение»"]);
  const p = yamlToFields("incoming:\n  password: x\n", mail, true);
  assert.ok("fields" in p && p.warnings.length === 1 && p.fields.host === "pop.mail.ru");
});

test("broken YAML is an error", () => {
  assert.ok("error" in yamlToFields("name: [unclosed", mail, false));
  assert.ok("error" in yamlToFields("- list", mail, false));
});
