"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ICONS, IconButton } from "./icons";
import { useOutside } from "./TablePart";
import { BUILTIN_GUARDS, cleanRules, isBuiltin, ruleKey, ruleLabel, type GuardRule } from "@/lib/agents/policy";
import { MAX_STEPS_LIMIT } from "@/lib/agents/guardrails";

/** A guardrail document from the catalog (section «Гардрейлы»). */
export type GuardDoc = { id: string; name: string; desc: string; enabled: boolean };

const BUILTIN = "встроенный", DOCUMENT = "документ";

/**
 * Guardrails as a «табличная часть»: built-in rules and documents from the catalog, with «Вид», search, «+ Фильтр» by kind,
 * «Добавить» (a step limit and a topic take their value right in the list) and «Убрать» per row. The parent keeps `rules`.
 */
export function GuardrailPart({ rules, onChange, docs }: { rules: GuardRule[]; onChange: (rules: GuardRule[]) => void; docs: GuardDoc[] }) {
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [fOpen, setFOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stepsIn, setStepsIn] = useState("5");
  const [topicIn, setTopicIn] = useState("");
  const fRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  useOutside(fOpen, fRef, () => setFOpen(false));
  useOutside(addOpen, aRef, () => setAddOpen(false));

  const doc = (id: string) => docs.find((d) => d.id === id);
  const label = (r: GuardRule) => ruleLabel(r, (id) => doc(id)?.name);
  const desc = (r: GuardRule) => (isBuiltin(r) ? BUILTIN_GUARDS[r.kind].desc : doc(r.id)?.desc || "Документ из раздела «Гардрейлы»");
  const kindOf = (r: GuardRule) => (isBuiltin(r) ? BUILTIN : DOCUMENT);
  const has = (k: GuardRule["kind"]) => rules.some((r) => r.kind === k);
  const needle = q.trim().toLowerCase();
  const rows = rules.filter((r) => (!needle || `${label(r)} ${desc(r)}`.toLowerCase().includes(needle)) && (!kinds.length || kinds.includes(kindOf(r))));
  const freeDocs = docs.filter((d) => !rules.some((r) => r.kind === "document" && r.id === d.id));
  const add = (r: GuardRule) => { onChange(cleanRules([...rules, r])); setAddOpen(false); };
  const addSteps = () => add({ kind: "maxSteps", value: Math.min(MAX_STEPS_LIMIT, Math.max(1, Math.round(Number(stepsIn)) || 5)) });
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
                <div className="flabel">Вид</div>
                {[BUILTIN, DOCUMENT].map((k) => (
                  <label className="toggle" key={k}>
                    <input type="checkbox" checked={kinds.includes(k)} onChange={() => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))} />
                    <span>{k}</span>
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
              <div className="flabel">Встроенные</div>
              {!has("maskPii") && (
                <button type="button" role="menuitem" onClick={() => add({ kind: "maskPii" })}>
                  <b>{BUILTIN_GUARDS.maskPii.label}</b><span className="sub">{BUILTIN_GUARDS.maskPii.desc}</span>
                </button>
              )}
              {!has("maxSteps") && (
                <div className="grow">
                  <b>{BUILTIN_GUARDS.maxSteps.label}</b><span className="sub">{BUILTIN_GUARDS.maxSteps.desc}</span>
                  <div className="gin">
                    <input type="number" min={1} max={MAX_STEPS_LIMIT} value={stepsIn} aria-label="Лимит шагов" onChange={(e) => setStepsIn(e.target.value)} onKeyDown={enter(addSteps)} />
                    <button type="button" className="btn ghost sm" onClick={addSteps}>Добавить</button>
                  </div>
                </div>
              )}
              <div className="grow">
                <b>{BUILTIN_GUARDS.forbiddenTopic.label}</b><span className="sub">{BUILTIN_GUARDS.forbiddenTopic.desc}</span>
                <div className="gin">
                  <input value={topicIn} maxLength={80} placeholder="например, политика" aria-label="Запрещённая тема" onChange={(e) => setTopicIn(e.target.value)} onKeyDown={enter(addTopic)} />
                  <button type="button" className="btn ghost sm" disabled={!topicIn.trim()} onClick={addTopic}>Добавить</button>
                </div>
              </div>
              <div className="flabel">Документы</div>
              {freeDocs.map((d) => (
                <button key={d.id} type="button" role="menuitem" onClick={() => add({ kind: "document", id: d.id })}>
                  <b>{d.name}</b>{!d.enabled && <span className="muted"> · выключен</span>}{d.desc && <span className="sub">{d.desc}</span>}
                </button>
              ))}
              {freeDocs.length === 0 && (
                <div className="grow muted">
                  {docs.length ? "Все документы уже добавлены." : <>Документов пока нет — загрузите их в разделе <Link href="/guardrails" className="b link">«Гардрейлы»</Link>.</>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="tpart">
        <table>
          <thead><tr><th>Гардрейл</th><th>Вид</th><th>Описание</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="muted tempty">{rules.length ? "Ничего не найдено" : "Пока ничего не добавлено"}</td></tr>
            ) : rows.map((r) => {
              const d = r.kind === "document" ? doc(r.id) : undefined;
              return (
                <tr key={ruleKey(r)}>
                  <td><b>{label(r)}</b>{d && !d.enabled && <span className="muted"> · выключен</span>}</td>
                  <td><span className={`st ${isBuiltin(r) ? "mut" : "info"}`}>{kindOf(r)}</span></td>
                  <td className="muted">{desc(r)}</td>
                  <td className="acts"><IconButton icon="del" title="Убрать" onClick={() => onChange(rules.filter((x) => ruleKey(x) !== ruleKey(r)))} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
