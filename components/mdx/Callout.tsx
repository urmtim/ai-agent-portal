const ICONS: Record<string, string> = { info: "💡", tip: "✅", warn: "⚠️" };

export function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "tip" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className={`callout ${type}`}>
      <span className="ic">{ICONS[type] ?? "💡"}</span>
      <div>{children}</div>
    </div>
  );
}
