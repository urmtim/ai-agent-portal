"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS, type AssistantApi, type AssistantConfig } from "@/lib/assistant-config";
import { saveAssistant } from "./actions";

export function AssistantForm({ cfg, models, defaultModel, agents }: {
  cfg: AssistantConfig;
  models: { id: string; name: string }[];
  defaultModel: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
}) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAssistant, undefined);
  useEffect(() => { if (state?.ok) toast(state.ok); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form onSubmit={onSubmit}>
      <div className="card pad asec">
        <h2 className="title">Модель</h2>
        <select id="as-model" name="modelId" aria-label="Модель" defaultValue={cfg.modelId ?? ""} style={{ maxWidth: 360 }}>
          <option value="">По умолчанию — {defaultModel}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="hint">На ней ассистент отвечает в чате, если в самом чате не выбрана другая модель.</div>
      </div>

      <div className="card pad asec">
        <h2 className="title">Агенты</h2>
        <p className="hint" style={{ marginTop: 0 }}>Каких агентов ассистент может запускать. Запуск — всегда с вашего подтверждения в чате.</p>
        {agents.length === 0 ? (
          <div className="muted">У вас пока нет агентов — создайте их на странице <Link href="/agents" className="link">«Агенты»</Link>.</div>
        ) : agents.map((a) => (
          <label className="toggle acheck" key={a.id}>
            <input type="checkbox" name="agent" value={a.id} defaultChecked={cfg.agentIds.includes(a.id)} />
            <span><b>{a.name}</b>{!a.enabled && <span className="muted"> · выключен</span>}<span className="sub">{a.desc}</span></span>
          </label>
        ))}
      </div>

      <div className="card pad asec">
        <h2 className="title">MCP</h2>
        <div className="muted">MCP-серверов пока нет. Когда они появятся в разделе <Link href="/mcp" className="link">MCP</Link>, здесь можно будет разрешить ассистенту ими пользоваться.</div>
      </div>

      <div className="card pad asec">
        <h2 className="title">API</h2>
        <p className="hint" style={{ marginTop: 0 }}>Какие данные портала ассистент может читать.</p>
        {(Object.keys(ASSISTANT_APIS) as AssistantApi[]).map((k) => (
          <label className="toggle acheck" key={k}>
            <input type="checkbox" name="api" value={k} defaultChecked={cfg.apis.includes(k)} />
            <span><b>{ASSISTANT_APIS[k].label}</b><span className="sub">{ASSISTANT_APIS[k].desc}</span></span>
          </label>
        ))}
      </div>

      {state?.error && <div className="formerr" style={{ marginBottom: 14 }}>{state.error}</div>}
      <button className="btn primary" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить"}</button>
    </form>
  );
}
