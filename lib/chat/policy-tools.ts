// Always-available tools of the assistant and custom agents: current_time and get_policies.
// The policies are also put into the model's history by the server before every answer (policyPreamble),
// so the model can't skip them; the snapshot is built in code from the settings, the model can't change it.
import { tool, type ModelMessage } from "ai";
import { z } from "zod";
import { effectiveGuardrails, HITL_LABELS, type GuardRule, type HitlChoice } from "@/lib/agents/policy";

export type PolicySnapshot = ReturnType<typeof policySnapshot>;

/** What get_policies returns: HITL and guardrails as plain facts (documents only the enabled ones, passed in). */
export function policySnapshot(hitl: HitlChoice, rules: GuardRule[], docs: { name: string; text: string }[]) {
  const g = effectiveGuardrails(rules);
  const ask = hitl === "off" ? [] : hitl === "send_only" ? ["отправка наружу (письмо, сообщение, публикация)"]
    : ["изменение данных (запись, правка, удаление)", "отправка наружу (письмо, сообщение, публикация)"];
  return {
    hitl: {
      mode: HITL_LABELS[hitl],
      confirmBefore: ask,
      noConfirmation: hitl === "off" ? ["любые действия — после них коротко сообщай, что сделал"] : hitl === "send_only" ? ["чтение", "изменение данных — после него коротко сообщай, что сделал"] : ["чтение"],
    },
    guardrails: {
      forbiddenTopics: g.forbiddenTopics,
      maskedPersonalData: g.maskPii ? ["почта → [почта]", "телефон → [телефон]", "номер карты → [карта]", "паспорт → [паспорт]"] : [],
      maxToolStepsPerAnswer: g.maxSteps,
      documents: docs.map((d) => ({ name: d.name, rules: d.text })),
    },
  };
}

/** «30 октября 2026 г., 14:20 (Москва)» and parts. */
export function timeNow(now = new Date()) {
  const tz = "Europe/Moscow";
  const date = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, dateStyle: "long" }).format(now);
  const weekday = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(now);
  return { date, weekday, time, timezone: "Москва (UTC+3)", iso: now.toISOString() };
}

/** The two tools; `snapshot` is computed once per answer from the current settings. */
export function policyTools(snapshot: PolicySnapshot) {
  return {
    current_time: tool({
      description: "Текущие дата, день недели и время (Москва). Вызывай, когда нужны «сегодня», «вчера», «за неделю», сроки.",
      inputSchema: z.object({}),
      execute: async () => timeNow(),
    }),
    get_policies: tool({
      description: "Твои политики: подтверждение действий (HITL) и гардрейлы — запрещённые темы, маскирование персональных данных, лимит шагов, правила из документов.",
      inputSchema: z.object({}),
      execute: async () => snapshot,
    }),
  };
}

/** A get_policies call with its result, as if the model made it — put right before the current question. */
export function policyPreamble(snapshot: PolicySnapshot, id = "policies"): ModelMessage[] {
  const toolCallId = `call_${id}`;
  return [
    { role: "assistant", content: [{ type: "tool-call", toolCallId, toolName: "get_policies", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId, toolName: "get_policies", output: { type: "json", value: snapshot } }] },
  ];
}

/** Model messages with the preamble inserted before the last user message (or at the end when there is none). */
export function withPolicies(messages: ModelMessage[], snapshot: PolicySnapshot): ModelMessage[] {
  let at = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") { at = i; break; }
  return [...messages.slice(0, at), ...policyPreamble(snapshot), ...messages.slice(at)];
}
