"use client";

import { useEffect, useState, useTransition } from "react";
import { ConfirmModal, Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS } from "@/lib/assistant-config";
import { deleteAgentById, runAgentById, saveAgent } from "./actions";

const TYPES = [{ value: "RECEIPTS", label: "Чеки из почты", desc: "Читает письма → пишет в «Траты»" }];

/** What the agent window edits; built on the server from the Agent row. */
export type AgentEditData = {
  id: string; name: string; enabled: boolean; modelId: string | null; sinceDays: number; max: number; fromFilter: string;
  agentIds: string[]; mcpIds: string[]; apis: string[];
};
/** What every agent window needs to offer: models and the user's agents. */
export type AgentChoices = {
  models: { id: string; name: string }[];
  defaultModel: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
  /** The user's MCP connections (section MCP). */
  connections: { id: string; name: string; desc: string }[];
};

const ON = "включён", OFF = "выключен";
type Tab = "general" | "agents" | "mcp" | "apis";

/** The agent window: «Общее · Агенты · MCP · API». Creates when `a` is missing. */
function AgentForm({ a, models, defaultModel, agents, connections, onDone }: { a?: AgentEditData; onDone: () => void } & AgentChoices) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAgent, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [picked, setPicked] = useState({ agents: a?.agentIds ?? [], mcp: a?.mcpIds ?? [], apis: a?.apis ?? [] });
  const set = (key: keyof typeof picked) => (ids: string[]) => setPicked((p) => ({ ...p, [key]: ids }));
  const agentItems: PartItem[] = agents.filter((x) => x.id !== a?.id)
    .map((x) => ({ id: x.id, name: x.name, desc: x.desc, note: x.enabled ? undefined : OFF, facet: x.enabled ? ON : OFF }));
  const apiItems: PartItem[] = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, name: v.label, desc: v.desc }));
  const connItems: PartItem[] = connections.map((c) => ({ id: c.id, name: c.name, desc: c.desc }));

  return (
    <form onSubmit={onSubmit}>
      {a && <input type="hidden" name="agentId" value={a.id} />}
      <FormTabs active={tab} onChange={setTab} tabs={[
        { key: "general", label: "Общее" },
        { key: "agents", label: "Агенты", count: picked.agents.length },
        { key: "mcp", label: "MCP", count: picked.mcp.length },
        { key: "apis", label: "API", count: picked.apis.length },
      ]} />

      <div className="mpanel" hidden={tab !== "general"}>
        <div className="grid cols2" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="ag-type">Тип агента</label>
            {a ? <input id="ag-type" value={TYPES[0].label} disabled /> : (
              <select id="ag-type" name="type" defaultValue="RECEIPTS">
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            )}
            <div className="hint">{TYPES[0].desc}</div>
          </div>
          <div className="field">
            <label htmlFor="ag-ename">Название</label>
            <input id="ag-ename" name="name" defaultValue={a?.name} placeholder={TYPES[0].label} maxLength={80} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ag-model">Модель</label>
          <select id="ag-model" name="modelId" defaultValue={a?.modelId ?? ""}>
            <option value="">По умолчанию — {defaultModel}</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="grid cols3" style={{ gap: 14 }}>
          <div>
            <label htmlFor="ag-days">За сколько дней смотреть</label>
            <input id="ag-days" name="sinceDays" type="number" min={1} max={365} defaultValue={a?.sinceDays ?? 30} />
          </div>
          <div>
            <label htmlFor="ag-max">Макс. писем за прогон</label>
            <input id="ag-max" name="max" type="number" min={1} max={200} defaultValue={a?.max ?? 40} />
          </div>
          <div>
            <label htmlFor="ag-from">Фильтр по отправителю</label>
            <input id="ag-from" name="fromFilter" placeholder="например, pyaterochka" defaultValue={a?.fromFilter ?? ""} />
          </div>
        </div>
        <label className="toggle" style={{ marginTop: 14 }}>
          <input type="checkbox" name="enabled" defaultChecked={a?.enabled ?? true} /><span>Агент включён</span>
        </label>
      </div>

      <div className="mpanel" hidden={tab !== "agents"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Каких агентов этот агент сможет звать. «Чеки из почты» пока работает только с почтой — список начнёт действовать, когда агенты научатся звать друг друга.</div>
        <TablePart items={agentItems} picked={picked.agents} onChange={set("agents")} filter={{ label: "Состояние", options: [ON, OFF] }}
          nothingHint="Других агентов пока нет — создайте их кнопкой «Новый агент»." />
      </div>
      <div className="mpanel" hidden={tab !== "mcp"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Подключения из раздела MCP, которыми пользуется агент. «Чекам из почты» нужна «Почта».</div>
        <TablePart items={connItems} picked={picked.mcp} onChange={set("mcp")} nothingHint="Подключений пока нет — добавьте их в разделе MCP." />
      </div>
      <div className="mpanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={picked.apis} onChange={set("apis")} nothingHint="API портала пока нет." />
      </div>

      {picked.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {picked.mcp.map((id) => <input key={`m${id}`} type="hidden" name="mcp" value={id} />)}
      {picked.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

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
