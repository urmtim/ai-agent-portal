"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS, type AssistantConfig } from "@/lib/assistant-config";
import { MCP_ACCESS_LABELS, type McpAccess } from "@/lib/agents/policy";
import { saveAssistant } from "./actions";

type Props = {
  cfg: AssistantConfig;
  models: { id: string; name: string }[];
  defaultModel: string;
  defaultModelId: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
  connections: { id: string; name: string; desc: string }[];
};

const ON = "включён", OFF = "выключен";
type Tab = "general" | "agents" | "mcp" | "apis";

function AssistantForm({ cfg, models, defaultModelId, agents, connections, onDone }: Props & { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAssistant, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [picked, setPicked] = useState({ agents: cfg.agentIds, mcp: cfg.mcpIds, apis: cfg.apis as string[] });
  const set = (key: keyof typeof picked) => (ids: string[]) => setPicked((p) => ({ ...p, [key]: ids }));
  const [access, setAccess] = useState<Record<string, McpAccess>>(cfg.mcpAccess);
  const agentItems: PartItem[] = agents.map((a) => ({ id: a.id, name: a.name, desc: a.desc, note: a.enabled ? undefined : OFF, facet: a.enabled ? ON : OFF }));
  const apiItems: PartItem[] = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, name: v.label, desc: v.desc }));

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="mcpAccess" value={JSON.stringify(access)} />
      <FormTabs active={tab} onChange={setTab} tabs={[
        { key: "general", label: "Общее" },
        { key: "agents", label: "Агенты", count: picked.agents.length },
        { key: "mcp", label: "MCP", count: picked.mcp.length },
        { key: "apis", label: "API", count: picked.apis.length },
      ]} />

      <div className="apanel" hidden={tab !== "general"}>
        <div className="field">
          <label htmlFor="as-model">Модель</label>
          <select id="as-model" name="modelId" defaultValue={cfg.modelId ?? defaultModelId} disabled={models.length === 0}>
            {models.length === 0 && <option value="">Моделей нет — добавьте в разделе «Модели»</option>}
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === defaultModelId ? " · по умолчанию" : ""}</option>)}
          </select>
          <div className="hint">На этой модели работает чат. Только ваши подключённые модели (раздел «Модели»).</div>
        </div>
      </div>
      <div className="apanel" hidden={tab !== "agents"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Каких агентов ассистент может запускать из чата. Их действия подтверждаются по их собственным политикам.</div>
        <TablePart items={agentItems} picked={picked.agents} onChange={set("agents")} filter={{ label: "Состояние", options: [ON, OFF] }}
          nothingHint="У вас пока нет агентов — создайте их кнопкой «Новый агент»." />
      </div>
      <div className="apanel" hidden={tab !== "mcp"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Подключения из раздела MCP, которыми ассистент пользуется в чате. С «Почтой» он ищет и читает письма по вашей просьбе.</div>
        <TablePart items={connections.map((c) => ({ id: c.id, name: c.name, desc: c.desc }))} picked={picked.mcp} onChange={set("mcp")}
          nothingHint="Подключений пока нет — добавьте их в разделе MCP."
          column={{
            label: "Доступ",
            options: (Object.keys(MCP_ACCESS_LABELS) as McpAccess[]).map((k) => ({ value: k, label: MCP_ACCESS_LABELS[k] })),
            value: (id) => access[id] ?? "read",
            onChange: (id, v) => setAccess((p) => ({ ...p, [id]: v as McpAccess })),
          }} />
      </div>
      <div className="apanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={picked.apis} onChange={set("apis")} nothingHint="API портала пока нет." />
      </div>

      {/* what gets saved, whichever tab is open */}
      {picked.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {picked.mcp.map((id) => <input key={`m${id}`} type="hidden" name="mcp" value={id} />)}
      {picked.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

/** ✎ in the «Ассистент» row (and the row click): its settings in a modal. */
export function AssistantActions(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Ассистент" editor>
        {open && <AssistantForm {...props} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
