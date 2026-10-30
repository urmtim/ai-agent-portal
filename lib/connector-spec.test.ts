import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FIELDS, fieldsToYaml, yamlToFields, type ConnectorFields } from "./connector-spec";

const mail: ConnectorFields = { ...EMPTY_FIELDS, kind: "mail", name: "Моя почта", description: "Чеки", protocol: "pop3", host: "pop.mail.ru", port: "995", sending: "smtp", smtpHost: "smtp.mail.ru", smtpPort: "465", user: "me@mail.ru" };

test("mail connector round-trips; no secrets in the text", () => {
  const y = fieldsToYaml(mail);
  assert.ok(y.includes("type: mail") && y.includes("protocol: pop3") && y.includes("port: 995") && y.includes("user: me@mail.ru"), y);
  assert.ok(!/password|token/.test(y.replace("Пароли и токены", "")));
  const back = yamlToFields(y, EMPTY_FIELDS, false);
  assert.ok("fields" in back);
  assert.deepEqual(back.fields, mail);
  assert.deepEqual(back.warnings, []);
});

test("no sending: «outgoing: none», read back as none", () => {
  const off: ConnectorFields = { ...mail, sending: "none", smtpHost: "", smtpPort: "465" };
  const y = fieldsToYaml(off);
  assert.ok(y.includes("outgoing: none"), y);
  const back = yamlToFields(y, mail, true);
  assert.ok("fields" in back && back.fields.sending === "none");
  const keep = yamlToFields("name: X\n", mail, true);
  assert.ok("fields" in keep && keep.fields.sending === "smtp"); // not in the file → as it was
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

test("mail tools: «tools:» lists the ones on; a file without it keeps the checkboxes", () => {
  const y = fieldsToYaml({ ...mail, toolsOff: ["trash", "send"] });
  assert.ok(y.includes("tools:\n  - search") && !y.includes("- trash") && !y.includes("- send\n"), y);
  const back = yamlToFields(y, mail, true);
  assert.ok("fields" in back);
  assert.deepEqual(back.fields.toolsOff, ["trash", "send"]);
  const keep = yamlToFields("name: X\n", { ...mail, toolsOff: ["spam"] }, true);
  assert.ok("fields" in keep && keep.fields.toolsOff.join() === "spam");
  const none = yamlToFields("tools: []\n", mail, true);
  assert.ok("fields" in none && none.fields.toolsOff.length === 14);
});

test("a new connector has no type: only the general part in YAML", () => {
  const y = fieldsToYaml({ ...EMPTY_FIELDS, name: "Новый" });
  assert.ok(y.includes('type: ""') && !y.includes("incoming") && !y.includes("url") && !y.includes("tools"), y);
});

test("broken YAML is an error", () => {
  assert.ok("error" in yamlToFields("name: [unclosed", mail, false));
  assert.ok("error" in yamlToFields("- list", mail, false));
});
