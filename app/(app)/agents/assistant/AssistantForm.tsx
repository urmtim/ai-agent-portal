"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { IconButton } from "@/components/ui/icons";
import type { AssistantConfig } from "@/lib/assistant-config";
import { AgentForm, type AgentChoices } from "../AgentModals";
import { saveAssistant } from "./actions";

/**
 * ✎ in the «Ассистент» row (and the row click): the built-in agent opens the same window as any agent,
 * with the on/off slider, «Название» and «Системная инструкция» (the real built-in one) locked.
 */
export function AssistantActions({ cfg, instruction, ...choices }: { cfg: AssistantConfig; instruction: string } & AgentChoices) {
  const [open, setOpen] = useState(false);
  const a = {
    id: "assistant", name: "Ассистент", description: "С ним вы говорите в чате", enabled: true, modelId: cfg.modelId, instruction,
    hitl: cfg.hitl, guardrails: cfg.guardrails, agentIds: cfg.agentIds, connectorIds: cfg.connectorIds,
  };
  return (
    <>
      <IconButton icon="edit" title="Изменить" data-row-open onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Ассистент" editor>
        {open && <AgentForm builtin a={a} save={saveAssistant} {...choices} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
