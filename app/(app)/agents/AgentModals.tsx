"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import { DEFAULT_GUARDRAILS, MAX_STEPS_LIMIT } from "@/lib/agents/guardrails";
import { specToYaml, yamlToSpec, type AgentSpec, type Hitl } from "@/lib/agents/spec";
import type { agentEditData } from "@/lib/agents/edit-data";
import { deleteAgentById, runAgentById, saveAgent } from "./actions";

const TYPES = {
  CUSTOM: { label: "Свой агент", desc: "Работает по вашей инструкции с выбранными инструментами" },
  RECEIPTS: { label: "Чеки из почты", desc: "Читает письма → пишет в «Траты»" },
} as const;
type Kind = keyof typeof TYPES;

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
type Tab = "general" | "instruction" | "guardrails" | "agents" | "mcp" | "apis" | "yaml";

/** The window's fields; agents, MCP and APIs by id. */
type Fields = {
  type: Kind; name: string; modelId: string; enabled: boolean;
  instruction: string; hitl: Hitl; maskPii: boolean; maxSteps: number; topics: string;
  sinceDays: number; max: number; fromFilter: string;
  agents: string[]; mcp: string[]; apis: string[];
};

const topicList = (t: string) => t.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const idsByName = (names: string[], items: { id: string; name: string }[]) =>
  names.map((n) => items.find((x) => x.name === n)?.id).filter((x): x is string => !!x);
const namesById = (ids: string[], items: { id: string; name: string }[]) =>
  ids.map((id) => items.find((x) => x.id === id)?.name).filter((x): x is string => !!x);

function initial(a: AgentEditData | undefined, defaultModelId: string): Fields {
  const g = a?.guardrails ?? DEFAULT_GUARDRAILS;
  return {
    type: a?.type ?? "CUSTOM", name: a?.name ?? "", modelId: a?.modelId ?? defaultModelId, enabled: a?.enabled ?? true,
    instruction: a?.instruction ?? "", hitl: a?.hitl ?? "confirm", maskPii: g.maskPii, maxSteps: g.maxSteps, topics: g.forbiddenTopics.join(", "),
    sinceDays: a?.sinceDays ?? 30, max: a?.max ?? 40, fromFilter: a?.fromFilter ?? "",
    agents: a?.agentIds ?? [], mcp: a?.mcpIds ?? [], apis: a?.apis ?? [],
  };
}

/** The agent window: «Общее · Инструкция · Гардрейлы · Агенты · MCP · API · YAML». Creates when `a` is missing. */
function AgentForm({ a, models, defaultModelId, agents, connections, onDone }: { a?: AgentEditData; onDone: () => void } & AgentChoices) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAgent, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [f, setF] = useState<Fields>(() => initial(a, defaultModelId));
  const upd = (patch: Partial<Fields>) => setF((p) => ({ ...p, ...patch }));
  const custom = f.type === "CUSTOM";

  const others = agents.filter((x) => x.id !== a?.id);
  const apiList = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, label: v.label, desc: v.desc }));
  const agentItems: PartItem[] = others.map((x) => ({ id: x.id, name: x.name, desc: x.desc, note: x.enabled ? undefined : OFF, facet: x.enabled ? ON : OFF }));
  const apiItems: PartItem[] = apiList.map((x) => ({ id: x.id, name: x.label, desc: x.desc }));
  const connItems: PartItem[] = connections.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));

  // ---- YAML: generated from the form when the tab opens; every edit there fills the form ----
  const known = { models: models.map((m) => m.name), connections: connections.map((c) => c.name), agents: others.map((x) => x.name), apis: apiList.map((x) => x.id) };
  const toSpec = (v: Fields): AgentSpec => ({
    name: v.name, type: v.type === "RECEIPTS" ? "receipts" : "custom", enabled: v.enabled,
    model: models.find((m) => m.id === v.modelId)?.name ?? null,
    instruction: v.instruction, hitl: v.hitl,
    guardrails: { maskPii: v.maskPii, maxSteps: v.maxSteps, forbiddenTopics: topicList(v.topics) },
    mcp: namesById(v.mcp, connections), agents: namesById(v.agents, others), api: v.apis,
    receipts: { sinceDays: v.sinceDays, max: v.max, fromFilter: v.fromFilter },
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
    const warnings = [...r.warnings];
    let type: Kind = s.type === "receipts" ? "RECEIPTS" : "CUSTOM";
    if (a && type !== a.type) { warnings.push(`Тип агента не меняется — остаётся «${TYPES[a.type].label}»`); type = a.type; }
    setF({
      type, name: s.name, modelId: models.find((m) => m.name === s.model)?.id ?? defaultModelId, enabled: s.enabled,
      instruction: s.instruction, hitl: s.hitl, maskPii: s.guardrails.maskPii, maxSteps: s.guardrails.maxSteps, topics: s.guardrails.forbiddenTopics.join(", "),
      sinceDays: s.receipts.sinceDays, max: s.receipts.max, fromFilter: s.receipts.fromFilter,
      agents: idsByName(s.agents, others), mcp: idsByName(s.mcp, connections), apis: s.api,
    });
    setYamlNote({ warnings });
  }
  function download() {
    const text = tab === "yaml" ? yaml : specToYaml(toSpec(f));
    const url = URL.createObjectURL(new Blob([text], { type: "application/yaml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(f.name.trim() || TYPES[f.type].label).replace(/[\\/:*?"<>|]+/g, "_")}.yaml`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) applyYaml(await file.text());
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "general", label: "Общее" },
    ...(custom ? [{ key: "instruction" as const, label: "Инструкция" }, { key: "guardrails" as const, label: "Гардрейлы" }] : []),
    { key: "agents", label: "Агенты", count: f.agents.length },
    { key: "mcp", label: "MCP", count: f.mcp.length },
    { key: "apis", label: "API", count: f.apis.length },
    { key: "yaml", label: "YAML" },
  ];

  return (
    <form onSubmit={onSubmit}>
      {a && <input type="hidden" name="agentId" value={a.id} />}
      <FormTabs active={tab} onChange={openTab} tabs={tabs} />

      <div className="mpanel" hidden={tab !== "general"}>
        <div className="grid cols2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="ag-type">Тип агента</label>
            {a ? <input id="ag-type" value={TYPES[f.type].label} disabled /> : (
              <select id="ag-type" name="type" value={f.type} onChange={(e) => upd({ type: e.target.value as Kind })}>
                {(Object.keys(TYPES) as Kind[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
              </select>
            )}
            <div className="hint">{TYPES[f.type].desc}</div>
          </div>
          <div className="field">
            <label htmlFor="ag-ename">Название</label>
            <input id="ag-ename" name="name" value={f.name} onChange={(e) => upd({ name: e.target.value })} placeholder={TYPES[f.type].label} maxLength={80} />
          </div>
        </div>
        <div className="grid cols2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="ag-model">Модель</label>
            <select id="ag-model" name="modelId" value={f.modelId} onChange={(e) => upd({ modelId: e.target.value })} disabled={models.length === 0}>
              {models.length === 0 && <option value="">Моделей нет — добавьте в разделе «Модели»</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ag-hitl">Запуск из чата (HITL)</label>
            <select id="ag-hitl" name="hitl" value={f.hitl} onChange={(e) => upd({ hitl: e.target.value as Hitl })}>
              <option value="confirm">Подтверждать запуск</option>
              <option value="none">Без подтверждения</option>
            </select>
            <div className="hint">{f.hitl === "none" ? "Ассистент и другие агенты запускают его сразу" : "Ассистент спросит вас перед запуском"}</div>
          </div>
        </div>
        {!custom && (
          <div className="grid cols3" style={{ gap: 14 }}>
            <div>
              <label htmlFor="ag-days">За сколько дней смотреть</label>
              <input id="ag-days" name="sinceDays" type="number" min={1} max={365} value={f.sinceDays} onChange={(e) => upd({ sinceDays: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="ag-max">Макс. писем за прогон</label>
              <input id="ag-max" name="max" type="number" min={1} max={200} value={f.max} onChange={(e) => upd({ max: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="ag-from">Фильтр по отправителю</label>
              <input id="ag-from" name="fromFilter" placeholder="например, pyaterochka" value={f.fromFilter} onChange={(e) => upd({ fromFilter: e.target.value })} />
            </div>
          </div>
        )}
        <label className="toggle" style={{ marginTop: 14 }}>
          <input type="checkbox" name="enabled" checked={f.enabled} onChange={(e) => upd({ enabled: e.target.checked })} /><span>Агент включён</span>
        </label>
      </div>

      {custom && (
        <div className="mpanel" hidden={tab !== "instruction"}>
          <div className="field">
            <label htmlFor="ag-instr">Системная инструкция</label>
            <textarea id="ag-instr" name="instruction" rows={12} maxLength={8000} value={f.instruction} onChange={(e) => upd({ instruction: e.target.value })}
              placeholder={"Кто агент и что делает. Например:\nТы составляешь короткую сводку новых писем: от кого, о чём, что требует ответа."} />
            <div className="hint">Первая строка становится описанием агента в списке. Задачу на конкретный запуск даёт ассистент в чате или поле «Задача» на странице агента.</div>
          </div>
        </div>
      )}
      {custom && (
        <div className="mpanel" hidden={tab !== "guardrails"}>
          <label className="toggle">
            <input type="checkbox" name="maskPii" checked={f.maskPii} onChange={(e) => upd({ maskPii: e.target.checked })} />
            <span>Маскировать персональные данные</span>
          </label>
          <div className="hint">Почта, телефоны, номера карт и паспортов в задаче и в письмах заменяются на [почта], [телефон], [карта], [паспорт] до отправки модели.</div>
          <div className="grid cols2" style={{ gap: 14, marginTop: 14 }}>
            <div className="field">
              <label htmlFor="ag-steps">Лимит шагов</label>
              <input id="ag-steps" name="maxSteps" type="number" min={1} max={MAX_STEPS_LIMIT} value={f.maxSteps}
                onChange={(e) => upd({ maxSteps: Math.min(MAX_STEPS_LIMIT, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} />
              <div className="hint">Сколько раз подряд агент может обратиться к модели и инструментам за один запуск (1–{MAX_STEPS_LIMIT}).</div>
            </div>
          </div>
          <div className="field">
            <label htmlFor="ag-topics">Запрещённые темы</label>
            <textarea id="ag-topics" name="topics" rows={3} value={f.topics} onChange={(e) => upd({ topics: e.target.value })} placeholder="через запятую или с новой строки: политика, медицина" />
          </div>
        </div>
      )}

      <div className="mpanel" hidden={tab !== "agents"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          {custom
            ? "Каких агентов этот агент сможет запускать сам. Сработают только включённые агенты «Без подтверждения»."
            : "«Чеки из почты» других агентов не запускает — список пригодится, если смените сценарий."}
        </div>
        <TablePart items={agentItems} picked={f.agents} onChange={(ids) => upd({ agents: ids })} filter={{ label: "Состояние", options: [ON, OFF] }}
          nothingHint="Других агентов пока нет — создайте их кнопкой «Новый агент»." />
      </div>
      <div className="mpanel" hidden={tab !== "mcp"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          {custom ? "Подключения из раздела MCP. «Почта» даёт агенту поиск и чтение писем." : "Подключения из раздела MCP, которыми пользуется агент. «Чекам из почты» нужна «Почта»."}
        </div>
        <TablePart items={connItems} picked={f.mcp} onChange={(ids) => upd({ mcp: ids })} nothingHint="Подключений пока нет — добавьте их в разделе MCP." />
      </div>
      <div className="mpanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={f.apis} onChange={(ids) => upd({ apis: ids })} nothingHint="API портала пока нет." />
      </div>

      <div className="mpanel" hidden={tab !== "yaml"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
          Весь агент текстом: правка здесь сразу меняет форму. Модель, подключения и агенты — по названию; пароли и токены сюда не попадают.
        </div>
        <textarea className="yaml-edit" aria-label="YAML агента" spellCheck={false} rows={16} value={yaml} onChange={(e) => applyYaml(e.target.value)} />
        {yamlNote.error && <div className="formerr">{yamlNote.error}</div>}
        {yamlNote.warnings.length > 0 && (
          <div className="callout warn yaml-warn"><div>{yamlNote.warnings.map((w) => <div key={w}>{w}</div>)}</div></div>
        )}
        <div className="wrap-gap" style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost sm" onClick={download}>Скачать .yaml</button>
          <label className="btn ghost sm">Загрузить файл<input type="file" accept=".yaml,.yml,text/yaml" hidden onChange={upload} /></label>
        </div>
      </div>

      {f.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {f.mcp.map((id) => <input key={`m${id}`} type="hidden" name="mcp" value={id} />)}
      {f.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : a ? "Сохранить" : "Создать"}</button>
      </div>
    </form>
  );
}

export function NewAgentButton(choices: AgentChoices) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary spacer" onClick={() => setOpen(true)}>Новый агент</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Новый агент" wide>
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
      <Modal open={open} onClose={() => setOpen(false)} title="Изменить агента" wide>
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
        text={<>«{name}» и история его прогонов будут удалены. Собранные чеки останутся в «Тратах».</>}
        onConfirm={remove} />
      <Modal open={edit} onClose={() => setEdit(false)} title="Изменить агента" wide>
        {edit && <AgentForm a={a} {...choices} onDone={() => setEdit(false)} />}
      </Modal>
    </>
  );
}
