"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ConfirmModal, Modal, QuestionModal, useModalHead, useUnsavedGuard } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { GuardrailPart, type GuardDoc } from "@/components/ui/GuardrailPart";
import { Switch } from "@/components/ui/Switch";
import { YamlEditor } from "@/components/ui/YamlEditor";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import { DEFAULT_GUARD_RULES, DEFAULT_HITL, HITL_LABELS, MCP_ACCESS_LABELS, type GuardRule, type HitlChoice, type McpAccess } from "@/lib/agents/policy";
import { specToYaml, yamlToSpec, type AgentSpec } from "@/lib/agents/spec";
import type { agentEditData } from "@/lib/agents/edit-data";
import { deleteAgentById, runAgentById, saveAgent } from "./actions";

/** What the agent window edits; built on the server from the Agent row (lib/agents/edit-data.ts) or the assistant. */
export type AgentEditData = ReturnType<typeof agentEditData>;
/** What every agent window needs to offer: models, the user's agents, connections and guardrail documents. */
export type AgentChoices = {
  models: { id: string; name: string }[];
  /** The model a new agent starts with: the assistant's, else the first one ("" — no models). */
  newModelId: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
  /** The user's MCP connections (section MCP). */
  connections: { id: string; name: string; desc: string }[];
  /** The user's guardrail documents (section «Гардрейлы»). */
  docs: GuardDoc[];
};

/** Saves the window: agents → saveAgent, the built-in assistant → saveAssistant. */
type SaveAction = (prev: { error?: string; ok?: string; id?: string } | undefined, fd: FormData) => Promise<{ error?: string; ok?: string; id?: string } | undefined>;

const ON = "включён", OFF = "выключен";
type Tab = "general" | "policies" | "subagents" | "mcp" | "apis" | "yaml";

/** The window's fields; subagents, MCP and APIs by id. */
type Fields = {
  name: string; modelId: string; enabled: boolean; instruction: string;
  hitl: HitlChoice; guardrails: GuardRule[];
  agents: string[]; mcp: string[]; mcpAccess: Record<string, McpAccess>; apis: string[];
};

const idsByName = (names: string[], items: { id: string; name: string }[]) =>
  names.map((n) => items.find((x) => x.name === n)?.id).filter((x): x is string => !!x);

function initial(a: AgentEditData | undefined, newModelId: string): Fields {
  return {
    name: a?.name ?? "", modelId: a?.modelId ?? newModelId, enabled: a?.enabled ?? true, instruction: a?.instruction ?? "",
    hitl: a?.hitl ?? DEFAULT_HITL, guardrails: a?.guardrails ?? [...DEFAULT_GUARD_RULES],
    agents: a?.agentIds ?? [], mcp: a?.mcpIds ?? [], mcpAccess: a?.mcpAccess ?? {}, apis: a?.apis ?? [],
  };
}

/**
 * The agent window (mockup «Агент — окно»): «Общее · Политики · Субагенты · MCP · API · YAML» and «Сохранить»;
 * the on/off slider sits in the header. The same window creates (no `a`), edits, and — with `builtin` — shows the
 * built-in assistant with its name, slider and instruction locked.
 */
export function AgentForm({ a, models, newModelId, agents, connections, docs, onDone, builtin, save = saveAgent }:
  { a?: AgentEditData; onDone: () => void; builtin?: boolean; save?: SaveAction } & AgentChoices) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(save, undefined);
  useEffect(() => {
    if (!state?.ok) return;
    onDone();
    toast(state.ok);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [start] = useState<Fields>(() => initial(a, newModelId));
  const [f, setF] = useState<Fields>(start);
  const upd = (patch: Partial<Fields>) => setF((p) => ({ ...p, ...patch }));
  // editing: «Сохранить» stays grey until something changes; × / Esc with changes ask first (Modal)
  const dirty = JSON.stringify(f) !== JSON.stringify(start);
  useUnsavedGuard(dirty);
  const head = useModalHead();
  const [askUpload, setAskUpload] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const others = agents.filter((x) => x.id !== a?.id);
  const apiList = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, label: v.label, desc: v.desc }));
  const agentItems: PartItem[] = others.map((x) => ({ id: x.id, name: x.name, desc: x.desc, note: x.enabled ? undefined : OFF, facet: x.enabled ? ON : OFF }));
  const apiItems: PartItem[] = apiList.map((x) => ({ id: x.id, name: x.label, desc: x.desc }));
  const connItems: PartItem[] = connections.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));

  // ---- YAML: generated from the form when the tab opens; every edit there fills the other tabs ----
  const docRefs = docs.map((d) => ({ id: d.id, name: d.name }));
  const known = { models: models.map((m) => m.name), connections: connections.map((c) => c.name), agents: others.map((x) => x.name), apis: apiList.map((x) => x.id), documents: docRefs };
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
    if (k === "yaml") { setYaml(specToYaml(toSpec(f), docRefs)); setYamlNote({ warnings: [] }); }
    setTab(k);
  }
  function applyYaml(text: string) {
    setYaml(text);
    const r = yamlToSpec(text, known);
    if ("error" in r) { setYamlNote({ error: r.error, warnings: [] }); return; }
    const s = r.spec;
    const mcp = idsByName(s.mcp.map((m) => m.name), connections);
    setF((p) => ({
      // a built-in agent keeps its name, its instruction and stays on
      name: builtin ? p.name : s.name, enabled: builtin ? true : s.enabled,
      modelId: models.find((m) => m.name === s.model)?.id ?? p.modelId, instruction: builtin ? p.instruction : s.instruction,
      hitl: s.hitl, guardrails: s.guardrails,
      agents: idsByName(s.agents, others), mcp,
      mcpAccess: Object.fromEntries(mcp.map((id) => [id, s.mcp.find((m) => m.name === connections.find((c) => c.id === id)?.name)?.access ?? "read"])),
      apis: s.api,
    }));
    setYamlNote({ warnings: r.warnings });
  }
  function download() {
    const text = tab === "yaml" ? yaml : specToYaml(toSpec(f), docRefs);
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
      {a && !builtin && <input type="hidden" name="agentId" value={a.id} />}
      <FormTabs active={tab} onChange={openTab} tabs={[
        { key: "general", label: "Общее" },
        { key: "policies", label: "Политики", count: f.guardrails.length },
        { key: "subagents", label: "Субагенты", count: f.agents.length },
        { key: "mcp", label: "MCP", count: f.mcp.length },
        { key: "apis", label: "API", count: f.apis.length },
        { key: "yaml", label: "YAML" },
      ]} />

      <div className="apanel fill" hidden={tab !== "general"}>
        <div className="field">
          <label htmlFor="ag-ename">Название</label>
          <input id="ag-ename" name="name" value={f.name} disabled={builtin} onChange={(e) => upd({ name: e.target.value })} placeholder="например, Сводка почты" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="ag-model">Модель</label>
          <select id="ag-model" name="modelId" value={f.modelId} onChange={(e) => upd({ modelId: e.target.value })} disabled={models.length === 0}>
            {models.length === 0 && <option value="">Моделей нет — добавьте в разделе «Модели»</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="ag-instr">Системная инструкция</label>
          <textarea id="ag-instr" name="instruction" maxLength={8000} value={f.instruction} disabled={builtin} onChange={(e) => upd({ instruction: e.target.value })}
            placeholder="Кто агент и что делает. Например: ты составляешь короткую сводку новых писем — от кого, о чём, что требует ответа." />
          {!builtin && <div className="hint">Первая строка — описание агента в списке.</div>}
        </div>
      </div>

      <div className="apanel" hidden={tab !== "policies"}>
        <div className="psec">
          <div className="field">
            <label htmlFor="ag-hitl">Подтверждение действий (HITL)</label>
            <select id="ag-hitl" value={f.hitl} onChange={(e) => upd({ hitl: e.target.value as HitlChoice })}>
              {(Object.keys(HITL_LABELS) as HitlChoice[]).map((k) => <option key={k} value={k}>{HITL_LABELS[k]}</option>)}
            </select>
            <div className="hint">Агент спрашивает вас перед действием и показывает, что именно сделает: кому письмо, какой текст. Чтение не подтверждается.</div>
          </div>
        </div>
        <div className="psec">
          <label>Гардрейлы</label>
          <div className="hint" style={{ marginTop: 0 }}>Правила, которые агент не может нарушить, что бы ни было в задаче: встроенные и документы из раздела «Гардрейлы».</div>
          <GuardrailPart rules={f.guardrails} docs={docs} onChange={(guardrails) => upd({ guardrails })} />
        </div>
      </div>

      <div className="apanel" hidden={tab !== "subagents"}>
        <TablePart items={agentItems} picked={f.agents} onChange={(ids) => upd({ agents: ids })} filter={{ label: "Состояние", options: [ON, OFF] }} />
      </div>
      <div className="apanel" hidden={tab !== "mcp"}>
        <TablePart items={connItems} picked={f.mcp} onChange={(ids) => upd({ mcp: ids })}
          column={{
            label: "Доступ",
            options: (Object.keys(MCP_ACCESS_LABELS) as McpAccess[]).map((k) => ({ value: k, label: MCP_ACCESS_LABELS[k] })),
            value: (id) => f.mcpAccess[id] ?? "read",
            onChange: (id, v) => upd({ mcpAccess: { ...f.mcpAccess, [id]: v as McpAccess } }),
          }} />
      </div>
      <div className="apanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={f.apis} onChange={(ids) => upd({ apis: ids })} />
      </div>

      <div className="apanel yamlpanel" hidden={tab !== "yaml"}>
        <YamlEditor label="YAML агента" value={yaml} onChange={applyYaml} />
        {yamlNote.error && <div className="formerr">{yamlNote.error}</div>}
        {yamlNote.warnings.length > 0 && (
          <div className="callout warn yaml-warn"><div>{yamlNote.warnings.map((w) => <div key={w}>{w}</div>)}</div></div>
        )}
        <div className="wrap-gap" style={{ marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={download}>Скачать</button>
          <button type="button" className="btn ghost" onClick={() => setAskUpload(true)}>Загрузить</button>
          <input ref={fileInput} type="file" accept=".yaml,.yml,text/yaml" hidden onChange={upload} />
        </div>
      </div>

      {/* «Включён» sits in the window's header, outside the form: it is submitted from here */}
      {head && createPortal(
        <Switch checked={builtin || f.enabled} disabled={builtin} onChange={(enabled) => upd({ enabled })}
          title={builtin ? "Ассистент всегда включён" : f.enabled ? "Агент включён" : "Агент выключен"} />, head)}
      {(builtin || f.enabled) && <input type="hidden" name="enabled" value="on" />}

      {/* what gets saved, whichever tab is open */}
      <input type="hidden" name="hitl" value={f.hitl} />
      <input type="hidden" name="guardrails" value={JSON.stringify({ rules: f.guardrails })} />
      <input type="hidden" name="mcpAccess" value={JSON.stringify(f.mcpAccess)} />
      {f.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {f.mcp.map((id) => <input key={`m${id}`} type="hidden" name="mcp" value={id} />)}
      {f.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending || (!!a && !dirty)}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
      <QuestionModal open={askUpload} title="Загрузить YAML?" text="Текущие настройки будут заменены данными из файла."
        confirmLabel="Заменить" onCancel={() => setAskUpload(false)}
        onConfirm={() => { setAskUpload(false); fileInput.current?.click(); }} />
    </form>
  );
}

export function NewAgentButton(choices: AgentChoices) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Добавить</button>
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
