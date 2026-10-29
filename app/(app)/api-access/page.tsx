import { AiTabs } from "@/components/AiTabs";
import { requireUser } from "@/lib/session";

export default async function ApiPage() {
  await requireUser();
  return (
    <div>
      <div className="pagehead">
        <div>
          <h1 className="title">API</h1>
          <p className="lead">Раздел в разработке.</p>
        </div>
      </div>
      <AiTabs active="/api-access" />
    </div>
  );
}
