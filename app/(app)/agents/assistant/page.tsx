import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { envModelName } from "@/lib/llm";
import { loadAssistant } from "@/lib/assistant";
import { AGENT_TYPES } from "@/lib/agents/types";
import { AssistantForm } from "./AssistantForm";

export default async function AssistantPage() {
  const user = await requireUser();
  const [cfg, models, agents] = await Promise.all([
    loadAssistant(user.id),
    prisma.llmModel.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, isDefault: true } }),
    prisma.agent.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, type: true, enabled: true } }),
  ]);
  const defaultModel = (models.find((m) => m.isDefault) ?? models[0])?.name ?? envModelName() ?? "не задана";

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <Link href="/agents" className="back">← Агенты</Link>
      <div className="pagehead">
        <div>
          <h1 className="title">Базовый ассистент</h1>
          <p className="lead">Отвечает в чате. Обращается только к тому, что вы здесь разрешили.</p>
        </div>
      </div>
      <AssistantForm cfg={cfg} defaultModel={defaultModel} models={models.map(({ id, name }) => ({ id, name }))}
        agents={agents.map((a) => ({ id: a.id, name: a.name, desc: AGENT_TYPES[a.type].desc, enabled: a.enabled }))} />
    </div>
  );
}
