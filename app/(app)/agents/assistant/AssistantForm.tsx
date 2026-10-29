"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS, type AssistantApi, type AssistantConfig } from "@/lib/assistant-config";
import { saveAssistant } from "./actions";

type Props = {
  cfg: AssistantConfig;
  models: { id: string; name: string }[];
  defaultModel: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
};

function AssistantForm({ cfg, models, defaultModel, agents, onDone }: Props & { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAssistant, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit}>
      <div className="asec">
        <label htmlFor="as-model">Модель</label>
        <select id="as-model" name="modelId" defaultValue={cfg.modelId ?? ""}>
          <option value="">По умолчанию — {defaultModel}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="hint">На ней ассистент отвечает в чате, если в самом чате не выбрана другая модель.</div>
      </div>

      <div className="asec">
        <div className="alabel">Агенты</div>
        <div className="hint">Каких агентов ассистент может запускать. Запуск — всегда с вашего подтверждения в чате.</div>
        {agents.length === 0 ? (
          <div className="muted">У вас пока нет агентов — создайте их кнопкой «Новый агент».</div>
        ) : agents.map((a) => (
          <label className="toggle acheck" key={a.id}>
            <input type="checkbox" name="agent" value={a.id} defaultChecked={cfg.agentIds.includes(a.id)} />
            <span><b>{a.name}</b>{!a.enabled && <span className="muted"> · выключен</span>}<span className="sub">{a.desc}</span></span>
          </label>
        ))}
      </div>

      <div className="asec">
        <div className="alabel">MCP</div>
        <div className="muted">MCP-серверов пока нет. Когда они появятся в разделе <Link href="/mcp" className="link">MCP</Link>, здесь можно будет разрешить ассистенту ими пользоваться.</div>
      </div>

      <div className="asec">
        <div className="alabel">API</div>
        <div className="hint">Какие данные портала ассистент может читать.</div>
        {(Object.keys(ASSISTANT_APIS) as AssistantApi[]).map((k) => (
          <label className="toggle acheck" key={k}>
            <input type="checkbox" name="api" value={k} defaultChecked={cfg.apis.includes(k)} />
            <span><b>{ASSISTANT_APIS[k].label}</b><span className="sub">{ASSISTANT_APIS[k].desc}</span></span>
          </label>
        ))}
      </div>

      {state?.error && <div className="formerr">{state.error}</div>}
      <div className="mfoot">
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
      </div>
    </form>
  );
}

/** ✎ in the «Базовый ассистент» row (and the row click): its settings in a modal. */
export function AssistantActions(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Базовый ассистент" sub="Отвечает в чате. Обращается только к тому, что вы здесь разрешили.">
        {open && <AssistantForm {...props} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
