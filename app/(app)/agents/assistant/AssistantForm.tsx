"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { useFormAction } from "@/components/ui/useFormAction";
import { ASSISTANT_APIS, type AssistantApi, type AssistantConfig } from "@/lib/assistant-config";
import { saveAssistant } from "./actions";

type Item = { id: string; name: string; desc: string; note?: string };

type Props = {
  cfg: AssistantConfig;
  models: { id: string; name: string }[];
  defaultModel: string;
  agents: { id: string; name: string; desc: string; enabled: boolean }[];
};

/** A table of what was added, plus «Добавить» from what is left (1C-style «табличная часть»). */
function TablePart({ items, picked, onChange, nothingHint, choose }: {
  items: Item[]; picked: string[]; onChange: (ids: string[]) => void; nothingHint: string; choose: string;
}) {
  const [next, setNext] = useState("");
  const rows = picked.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  const left = items.filter((i) => !picked.includes(i.id));

  return (
    <div>
      <div className="tpart">
        <table>
          <thead><tr><th>Название</th><th>Описание</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="muted tempty">Пока ничего не добавлено</td></tr>
            ) : rows.map((i) => (
              <tr key={i.id}>
                <td><b>{i.name}</b>{i.note && <span className="muted"> · {i.note}</span>}</td>
                <td className="muted">{i.desc}</td>
                <td className="acts"><IconButton icon="del" title="Убрать" onClick={() => onChange(picked.filter((x) => x !== i.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 ? (
        <div className="hint">{nothingHint}</div>
      ) : left.length > 0 && (
        <div className="tadd">
          <select aria-label={choose} value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="">{choose}</option>
            {left.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button type="button" className="btn ghost sm" disabled={!next} onClick={() => { onChange([...picked, next]); setNext(""); }}>Добавить</button>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: "agents", label: "Агенты" },
  { key: "mcp", label: "MCP" },
  { key: "apis", label: "API" },
] as const;

function AssistantForm({ cfg, models, defaultModel, agents, onDone }: Props & { onDone: () => void }) {
  const toast = useToast();
  const [state, onSubmit, pending] = useFormAction(saveAssistant, undefined);
  useEffect(() => { if (state?.ok) { toast(state.ok); onDone(); } }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("agents");
  const [picked, setPicked] = useState({ agents: cfg.agentIds, mcp: cfg.mcpIds, apis: cfg.apis as string[] });
  const set = (key: keyof typeof picked) => (ids: string[]) => setPicked((p) => ({ ...p, [key]: ids }));

  const agentItems: Item[] = agents.map((a) => ({ id: a.id, name: a.name, desc: a.desc, note: a.enabled ? undefined : "выключен" }));
  const apiItems: Item[] = (Object.keys(ASSISTANT_APIS) as AssistantApi[]).map((k) => ({ id: k, name: ASSISTANT_APIS[k].label, desc: ASSISTANT_APIS[k].desc }));

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="as-model">Модель</label>
        <select id="as-model" name="modelId" defaultValue={cfg.modelId ?? ""}>
          <option value="">По умолчанию — {defaultModel}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div className="hint">На ней ассистент отвечает в чате, если в самом чате не выбрана другая модель.</div>
      </div>

      <div className="mtabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : undefined} onClick={() => setTab(t.key)}>
            {t.label} <span className="n">{picked[t.key].length}</span>
          </button>
        ))}
      </div>

      {tab === "agents" && (
        <TablePart items={agentItems} picked={picked.agents} onChange={set("agents")} choose="Выберите агента…"
          nothingHint="У вас пока нет агентов — создайте их кнопкой «Новый агент». Запуск агента из чата — всегда с вашего подтверждения." />
      )}
      {tab === "mcp" && (
        <TablePart items={[]} picked={picked.mcp} onChange={set("mcp")} choose="Выберите MCP-сервер…"
          nothingHint="MCP-серверов пока нет — их будут добавлять в разделе MCP." />
      )}
      {tab === "apis" && (
        <TablePart items={apiItems} picked={picked.apis} onChange={set("apis")} choose="Выберите API…" nothingHint="API портала пока нет." />
      )}

      {/* what gets saved, whichever tab is open */}
      {picked.agents.map((id) => <input key={`a${id}`} type="hidden" name="agent" value={id} />)}
      {picked.apis.map((id) => <input key={`p${id}`} type="hidden" name="api" value={id} />)}

      {state?.error && <div className="formerr" style={{ marginTop: 14 }}>{state.error}</div>}
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
      <Modal open={open} onClose={() => setOpen(false)} title="Базовый ассистент" sub="Отвечает в чате. Обращается только к тому, что вы здесь добавили.">
        {open && <AssistantForm {...props} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
