"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { FormTabs, TablePart, type PartItem } from "@/components/ui/TablePart";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS, type AssistantConfig } from "@/lib/assistant-config";
import { saveAssistant } from "./actions";

type Props = {
  cfg: AssistantConfig;
  models: { id: string; name: string }[];
  defaultModel: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
};

const ON = "включён", OFF = "выключен";
type Tab = "general" | "agents" | "mcp" | "apis";

function AssistantForm({ cfg, models, defaultModel, agents, onDone }: Props & { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAssistant, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("general");
  const [picked, setPicked] = useState({ agents: cfg.agentIds, mcp: cfg.mcpIds, apis: cfg.apis as string[] });
  const set = (key: keyof typeof picked) => (ids: string[]) => setPicked((p) => ({ ...p, [key]: ids }));
  const agentItems: PartItem[] = agents.map((a) => ({ id: a.id, name: a.name, desc: a.desc, note: a.enabled ? undefined : OFF, facet: a.enabled ? ON : OFF }));
  const apiItems: PartItem[] = Object.entries(ASSISTANT_APIS).map(([k, v]) => ({ id: k, name: v.label, desc: v.desc }));

  return (
    <form onSubmit={onSubmit}>
      <FormTabs active={tab} onChange={setTab} tabs={[
        { key: "general", label: "Общее" },
        { key: "agents", label: "Агенты", count: picked.agents.length },
        { key: "mcp", label: "MCP", count: picked.mcp.length },
        { key: "apis", label: "API", count: picked.apis.length },
      ]} />

      <div className="mpanel" hidden={tab !== "general"}>
        <div className="field">
          <label htmlFor="as-model">Модель</label>
          <select id="as-model" name="modelId" defaultValue={cfg.modelId ?? ""}>
            <option value="">По умолчанию — {defaultModel}</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="hint">На ней ассистент отвечает во всех чатах.</div>
        </div>
      </div>
      <div className="mpanel" hidden={tab !== "agents"}>
        <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Каких агентов ассистент может запускать. Запуск — всегда с вашего подтверждения в чате.</div>
        <TablePart items={agentItems} picked={picked.agents} onChange={set("agents")} filter={{ label: "Состояние", options: [ON, OFF] }}
          nothingHint="У вас пока нет агентов — создайте их кнопкой «Новый агент»." />
      </div>
      <div className="mpanel" hidden={tab !== "mcp"}>
        <TablePart items={[]} picked={picked.mcp} onChange={set("mcp")} nothingHint="MCP-серверов пока нет — их будут добавлять в разделе MCP." />
      </div>
      <div className="mpanel" hidden={tab !== "apis"}>
        <TablePart items={apiItems} picked={picked.apis} onChange={set("apis")} nothingHint="API портала пока нет." />
      </div>

      {/* what gets saved, whichever tab is open */}
      {picked.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
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
      <Modal open={open} onClose={() => setOpen(false)} title="Ассистент" sub="С ним вы говорите в чате. Он обращается только к тому, что вы здесь добавили." wide>
        {open && <AssistantForm {...props} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
