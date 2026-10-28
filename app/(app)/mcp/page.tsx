import { requireUser } from "@/lib/session";

export default async function McpPage() {
  await requireUser();
  return (
    <div className="pagehead">
      <div>
        <h1 className="title">MCP</h1>
        <p className="lead">Раздел в разработке.</p>
      </div>
    </div>
  );
}
