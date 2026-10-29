"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { GuardrailPart } from "@/components/ui/GuardrailPart";
import { Switch } from "@/components/ui/Switch";
import { YamlEditor } from "@/components/ui/YamlEditor";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import {
  DEFAULT_GUARD_POLICY, DEFAULT_HITL, HITL_ASK_LABELS, MCP_ACCESS_LABELS,
  type GuardPolicy, type HitlAsk, type HitlPolicy, type McpAccess,
} from "@/lib/agents/policy";
import { specToYaml, yamlToSpec, type AgentSpec } from "@/lib/agents/spec";
import type { agentEditData } from "@/lib/agents/edit-data";
import { deleteAgentById, runAgentById, saveAgent } from "./actions";

/** What the agent window edits; built on the server from the Agent row (lib/agents/edit-data.ts). */
export type AgentEditData = ReturnType<typeof agentEditData>;
/** What every agent window needs to offer: models and the user's agents. */
export type AgentChoices = {
  models: { id: string; name: string }[];
  defaultModel: string;
  /** The owner's default model, preselected when nothing was chosen yet. */
  defaultModelId: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
  /** The user's MCP connections (section MCP). */
  connections: { id: string; name: string; desc: string }[];
};

const ON = "включён", OFF = "выключен";
type Tab = "general" | "policies" | "subagents" | "mcp" | "apis" | "yaml";

/** The window's fields; subagents, MCP and APIs by id. */
type Fields = {
  name: string; modelId: string; enabled: boolean; instruction: string;
  hitl: HitlPolicy; guardrails: GuardPolicy;
  agents: string[]; mcp: string[]; mcpAccess: Record<string, McpAccess>; apis: string[];
};

const idsByName = (names: string[], items: { id: string; name: string }[]) =>
  names.map((n) => items.find((x) => x.name === n)?.id).filter((x): x is string => !!x);

function initial(a: AgentEditData | undefined, defaultModelId: string): Fields {
  return {
    name: a?.name ?? "", modelId: a?.modelId ?? defaultModelId, enabled: a?.enabled ?? true, instruction: a?.instruction ?? "",
    hitl: a?.hitl ?? { ...DEFAULT_HITL },
    guardrails: a?.guardrails ?? { enabled: DEFAULT_GUARD_POLICY.enabled, rules: [...DEFAULT_GUARD_POLICY.rules] },
    agents: a?.agentIds ?? [], mcp: a?.mcpIds ?? [], mcpAccess: a?.mcpAccess ?? {}, apis: a?.apis ?? [],
  };
}

/**
 * The agent window (mockup «Агент — окно»): «Общее · Политики · Субагенты · MCP · API · YAML», «▶ Тест-запуск» and «Сохранить».
 * The same window creates (no `a`) and edits.
 */
function AgentForm({ a, models, defaultModelId, agents, connections, onDone }: { a?: AgentEditData; onDone: () => void } & AgentChoices) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAgent, undefined);
  const runAfter = useRef(false);
  useEffect(() => {
    if (!state?.ok) return;
    onDone();
    if (runAfter.current && state.id) {
      toast("Сохранено, запускаю агента…");
      void runAgentById(state.id).then((r) => toast(r?.ok ? `Агент отработал: ${r.ok}` : r?.error ?? "Готово"));
    } else toast(state.ok);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [f, setF] = useState<Fields>(() => initial(a, defaultModelId));
  const upd = (patch: Partial<Fields>) => setF((p) => ({ ...p, ...patch }));

  const others = agents.filter((x) => x.id !== a?.id);
  const apiList = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, label: v.label, desc: v.desc }));
  const agentItems: PartItem[] = others.map((x) => ({ id: x.id, name: x.name, desc: x.desc, note: x.enabled ? undefined : OFF, facet: x.enabled ? ON : OFF }));
  const apiItems: PartItem[] = apiList.map((x) => ({ id: x.id, name: x.label, desc: x.desc }));
  const connItems: PartItem[] = connections.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));

  // ---- YAML: generated from the form when the tab opens; every edit there fills the other tabs ----
  const known = { models: models.map((m) => m.name), connections: connections.map((c) => c.name), agents: others.map((x) => x.name), apis: apiList.map((x) => x.id) };
  const toSpec = (v: Fields): AgentSpec => ({
    name: v.name, enabled: v.enabled, model: models.find((m) => m.id === v.modelId)?.name ?? null, instruction: v.instruction,
    hitl: v.hitl, guardrails: v.guardrails,
    mcp: v.mcp.flatMap((id) => { const c = connections.find((x) => x.id === id); return c ? [{ name: c.name, access: v.mcpAccess[id] ?? "read" }] : []; }),
    agents: v.agents.map((id) => others.find((x) => x.id === id)?.name).filter((x): x is string => !!x),
    api: v.apis,
  });
  const [yaml, setYaml] = useState("");
  const [yamlNote, setYamlNote] = useState<{ error?: string; warnings: string[] }>({ warnings: [] });

  function openTab(k: Tab) {
    if (k === "yaml") { setYaml(specToYaml(toSpec(f))); setYamlNote({ warnings: [] }); }
    setTab(k);
  }
  function applyYaml(text: string) {
    setYaml(text);
    const r = yamlToSpec(text, known);
    if ("error" in r) { setYamlNote({ error: r.error, warnings: [] }); return; }
    const s = r.spec;
    const mcp = idsByName(s.mcp.map((m) => m.name), connections);
    setF({
      name: s.name, modelId: models.find((m) => m.name === s.model)?.id ?? defaultModelId, enabled: s.enabled, instruction: s.instruction,
      hitl: s.hitl, guardrails: s.guardrails,
      agents: idsByName(s.agents, others), mcp,
      mcpAccess: Object.fromEntries(mcp.map((id) => [id, s.mcp.find((m) => m.name === connections.find((c) => c.id === id)?.name)?.access ?? "read"])),
      apis: s.api,
    });
    setYamlNote({ warnings: r.warnings });
  }
  function download() {
    const text = tab === "yaml" ? yaml : specToYaml(toSpec(f));
    const url = URL.createObjectURL(new Blob([text], { type: "application/yaml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(f.name.trim() || "агент").replace(/[\\/:*?"<>|]+/g, "_")}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyYaml(await file.text());
  }

  return (
    <form onSubmit={onSubmit}>
      {a && <input type="hidden" name="agentId" value={a.id} />}
      <FormTabs active={tab} onChange={openTab} tabs={[
        { key: "general", label: "Общее" },
        { key: "policies", label: "Политики", count: f.guardrails.rules.length },
        { key: "subagents", label: "Субагенты", count: f.agents.length },
        { key: "mcp", label: "MCP", count: f.mcp.length },
        { key: "apis", label: "API", count: f.apis.length },
        { key: "yaml", label: "YAML" },
      ]} />

      <div className="apanel" hidden={tab !== "general"}>
        <div className="psec">
          <Switch name="enabled" checked={f.enabled} onChange={(enabled) => upd({ enabled })} label="Агент включён" />
          <div className="hint">Выключенный агент не запускается: ни из чата, ни другими агентами, ни вручную.</div>
        </div>
        <div className="field">
          <label htmlFor="ag-ename">Название</label>
          <input id="ag-ename" name="name" value={f.name} onChange={(e) => upd({ name: e.target.value })} placeholder="например, Сводка почты" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="ag-model">Модель</label>
          <select id="ag-model" name="modelId" value={f.modelId} onChange={(e) => upd({ modelId: e.target.value })} disabled={models.length === 0}>
            {models.length === 0 && <option value="">Моделей нет — добавьте в разделе «Модели»</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === defaultModelId ? " · по умолчанию" : ""}</option>)}
          </select>
          <div className="hint">Только ваши подключённые модели (раздел «Модели»). У нового агента сразу стоит модель по умолчанию.</div>
        </div>
        <div className="field">
          <label htmlFor="ag-instr">Системная инструкция</label>
          <textarea id="ag-instr" name="instruction" rows={5} maxLength={8000} value={f.instruction} onChange={(e) => upd({ instruction: e.target.value })}
            placeholder="Кто агент и что делает. Например: ты составляешь короткую сводку новых писем — от кого, о чём, что требует ответа." />
          <div className="hint">Первая строка — описание агента в списке.</div>
        </div>
      </div>

      <div className="apanel" hidden={tab !== "policies"}>
        <div className="psec">
          <Switch checked={f.hitl.enabled} onChange={(enabled) => upd({ hitl: { ...f.hitl, enabled } })} label="Человек в контуре (HITL)" />
          <div className="hint">Агент спрашивает вас перед действием и показывает, что именно сделает: кому письмо, какой текст. Чтение не подтверждается.</div>
          <select aria-label="Когда спрашивать" value={f.hitl.ask} disabled={!f.hitl.enabled} onChange={(e) => upd({ hitl: { ...f.hitl, ask: e.target.value as HitlAsk } })}>
            {(Object.keys(HITL_ASK_LABELS) as HitlAsk[]).map((k) => <option key={k} value={k}>{HITL_ASK_LABELS[k]}</option>)}
          </select>
        </div>
        <div className="psec">
          <Switch checked={f.guardrails.enabled} onChange={(enabled) => upd({ guardrails: { ...f.guardrails, enabled } })} label="Гардрейлы" />
          <div className="hint">Правила, которые агент не может нарушить, что бы ни было в задаче.</div>
          <GuardrailPart rules={f.guardrails.rules} onChange={(rules) => upd({ guardrails: { ...f.guardrails, rules } })} />
        </div>
      </div>

      <div className="apanel" hidden={tab !== "subagents"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Субагенты — агенты, которых этот агент может запускать сам. Пока сработают только включённые субагенты с выключенным HITL.</div>
        <TablePart items={agentItems} picked={f.agents} onChange={(ids) => upd({ agents: ids })} filter={{ label: "Состояние", options: [ON, OFF] }}
          nothingHint="Других агентов пока нет — создайте их кнопкой «Новый агент»." />
      </div>
      <div className="apanel" hidden={tab !== "mcp"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Подключения из раздела MCP. В «Доступе» — что агенту можно с этим подключением: только читать или ещё и отправлять.</div>
        <TablePart items={connItems} picked={f.mcp} onChange={(ids) => upd({ mcp: ids })} nothingHint="Подключений пока нет — добавьте их в разделе MCP."
          column={{
            label: "Доступ",
            options: (Object.keys(MCP_ACCESS_LABELS) as McpAccess[]).map((k) => ({ value: k, label: MCP_ACCESS_LABELS[k] })),
            value: (id) => f.mcpAccess[id] ?? "read",
            onChange: (id, v) => upd({ mcpAccess: { ...f.mcpAccess, [id]: v as McpAccess } }),
          }} />
      </div>
      <div className="apanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={f.apis} onChange={(ids) => upd({ apis: ids })} nothingHint="API портала пока нет." />
      </div>

      <div className="apanel yamlpanel" hidden={tab !== "yaml"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Весь агент текстом: правка здесь сразу меняет форму. Модель, подключения и агенты — по названию; пароли и токены сюда не попадают.
        </div>
        <YamlEditor label="YAML агента" value={yaml} onChange={applyYaml} />
        {yamlNote.error && <div className="formerr">{yamlNote.error}</div>}
        {yamlNote.warnings.length > 0 && (
          <div className="callout warn yaml-warn"><div>{yamlNote.warnings.map((w) => <div key={w}>{w}</div>)}</div></div>
        )}
        <div className="wrap-gap" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={download}>Скачать .yaml</button>
          <label className="btn primary">Загрузить .yaml<input type="file" accept=".yaml,.yml,text/yaml" hidden onChange={upload} /></label>
        </div>
      </div>

      {/* what gets saved, whichever tab is open */}
      <input type="hidden" name="hitl" value={JSON.stringify(f.hitl)} />
      <input type="hidden" name="guardrails" value={JSON.stringify(f.guardrails)} />
      <input type="hidden" name="mcpAccess" value={JSON.stringify(f.mcpAccess)} />
      {f.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {f.mcp.map((id) => <input key={`m${id}`} type="hidden" name="mcp" value={id} />)}
      {f.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <button className="btn ghost" type="submit" disabled={pending} onClick={() => { runAfter.current = true; }}
          title="Сохранить и сразу запустить агента">▶ Тест-запуск</button>
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending} onClick={() => { runAfter.current = false; }}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

export function NewAgentButton(choices: AgentChoices) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Новый агент</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый агент" editor>
        {open && <AgentForm {...choices} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

/** «Изменить» button for the agent page; opens the same window as the table row. */
export function AgentEditButton({ a, ...choices }: { a: AgentEditData } & AgentChoices) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>Изменить</button>
      <Modal open={open} onClose={() => setOpen(false)} title={a.name} editor>
        {open && <AgentForm a={a} {...choices} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function AgentActions({ a, ...choices }: { a: AgentEditData } & AgentChoices) {
  const { id, name } = a;
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [running, startRun] = useTransition();
  const [deleting, startDel] = useTransition();

  function run() {
    startRun(async () => {
      const r = await runAgentById(id);
      toast(r?.ok ?? r?.error ?? "Готово");
    });
  }
  function remove() {
    startDel(async () => {
      const r = await deleteAgentById(id);
      toast(r?.ok ?? r?.error ?? "Готово");
      setConfirm(false);
    });
  }

  return (
    <>
      <IconButton icon="run" title={running ? "Выполняется…" : "Запустить"} disabled={running} onClick={run} />
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setEdit(true)} />
      <IconButton icon="del" title="Удалить" onClick={() => setConfirm(true)} />
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Удалить агента?" pending={deleting}
        text={<>«{name}» и история его прогонов будут удалены.</>}
        onConfirm={remove} />
      <Modal open={edit} onClose={() => setEdit(false)} title={a.name} editor>
        {edit && <AgentForm a={a} {...choices} onDone={() => setEdit(false)} />}
      </Modal>
    </>
  );
}
