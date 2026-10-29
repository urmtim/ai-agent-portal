"use client";

import { useRef, useState } from "react";
import { ICONS, IconButton } from "./icons";
import { useOutside } from "./TablePart";
import { cleanRules, GUARD_KINDS, ruleKey, ruleLabel, type GuardRule } from "@/lib/agents/policy";
import { MAX_STEPS_LIMIT } from "@/lib/agents/guardrails";

type Kind = GuardRule["kind"];

/**
 * Guardrail rules as a «табличная часть»: search, «+ Фильтр» by kind, «Добавить» (a step limit and a topic ask for
 * their value right in the list) and «Убрать» per row. The parent keeps `rules`.
 */
export function GuardrailPart({ rules, onChange }: { rules: GuardRule[]; onChange: (rules: GuardRule[]) => void }) {
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [fOpen, setFOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stepsIn, setStepsIn] = useState("5");
  const [topicIn, setTopicIn] = useState("");
  const fRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  useOutside(fOpen, fRef, () => setFOpen(false));
  useOutside(addOpen, aRef, () => setAddOpen(false));

  const has = (k: Kind) => rules.some((r) => r.kind === k);
  const needle = q.trim().toLowerCase();
  const rows = rules.filter((r) => (!needle || `${ruleLabel(r)} ${GUARD_KINDS[r.kind].desc}`.toLowerCase().includes(needle)) && (!kinds.length || kinds.includes(r.kind)));
  const add = (r: GuardRule) => { onChange(cleanRules([...rules, r])); setAddOpen(false); };
  const addTopic = () => { const t = topicIn.trim(); if (t) { add({ kind: "forbiddenTopic", value: t.slice(0, 80) }); setTopicIn(""); } };
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); fn(); } };

  return (
    <div className="tpartwrap">
      <div className="tbar">
        <label className="search">
          <span className="sr">Поиск</span>{ICONS.search}
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" />
        </label>
        <div className="fwrap" ref={fRef}>
          <button type="button" className={kinds.length ? "btn dashed on" : "btn dashed"} aria-expanded={fOpen} onClick={() => setFOpen((v) => !v)}>
            {kinds.length ? `Фильтр · ${kinds.length}` : "+ Фильтр"}
          </button>
          {fOpen && (
            <div className="fpop" role="dialog" aria-label="Фильтр">
              <div className="fgroup">
                <div className="flabel">Гардрейл</div>
                {(Object.keys(GUARD_KINDS) as Kind[]).map((k) => (
                  <label className="toggle" key={k}>
                    <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))} />
                    <span>{GUARD_KINDS[k].label}</span>
                  </label>
                ))}
              </div>
              {kinds.length > 0 && <button type="button" className="btn ghost sm" onClick={() => setKinds([])}>Сбросить</button>}
            </div>
          )}
        </div>
        <div className="fwrap spacer" ref={aRef}>
          <button type="button" className="btn primary" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>Добавить</button>
          {addOpen && (
            <div className="fpop addpop gadd" role="menu">
              {!has("maskPii") && (
                <button type="button" role="menuitem" onClick={() => add({ kind: "maskPii" })}>
                  <b>{GUARD_KINDS.maskPii.label}</b><span className="sub">{GUARD_KINDS.maskPii.desc}</span>
                </button>
              )}
              {!has("maxSteps") && (
                <div className="grow">
                  <b>{GUARD_KINDS.maxSteps.label}</b><span className="sub">{GUARD_KINDS.maxSteps.desc}</span>
                  <div className="gin">
                    <input type="number" min={1} max={MAX_STEPS_LIMIT} value={stepsIn} aria-label="Лимит шагов" onChange={(e) => setStepsIn(e.target.value)}
                      onKeyDown={enter(() => add({ kind: "maxSteps", value: Math.min(MAX_STEPS_LIMIT, Math.max(1, Math.round(Number(stepsIn)) || 5)) }))} />
                    <button type="button" className="btn ghost sm" onClick={() => add({ kind: "maxSteps", value: Math.min(MAX_STEPS_LIMIT, Math.max(1, Math.round(Number(stepsIn)) || 5)) })}>Добавить</button>
                  </div>
                </div>
              )}
              <div className="grow">
                <b>{GUARD_KINDS.forbiddenTopic.label}</b><span className="sub">{GUARD_KINDS.forbiddenTopic.desc}</span>
                <div className="gin">
                  <input value={topicIn} maxLength={80} placeholder="например, политика" aria-label="Запрещённая тема" onChange={(e) => setTopicIn(e.target.value)} onKeyDown={enter(addTopic)} />
                  <button type="button" className="btn ghost sm" disabled={!topicIn.trim()} onClick={addTopic}>Добавить</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="tpart">
        <table>
          <thead><tr><th>Гардрейл</th><th>Описание</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="muted tempty">{rules.length ? "Ничего не найдено" : "Пока ничего не добавлено"}</td></tr>
            ) : rows.map((r) => (
              <tr key={ruleKey(r)}>
                <td><b>{ruleLabel(r)}</b></td>
                <td className="muted">{GUARD_KINDS[r.kind].desc}</td>
                <td className="acts"><IconButton icon="del" title="Убрать" onClick={() => onChange(rules.filter((x) => ruleKey(x) !== ruleKey(r)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
