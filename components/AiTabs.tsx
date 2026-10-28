import Link from "next/link";

const TABS = [
  { href: "/agents", label: "Агенты" },
  { href: "/mcp", label: "MCP" },
  { href: "/models", label: "Модели" },
] as const;

/** Tabs under the page title of the AI section pages. */
export function AiTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={t.href === active ? "on" : undefined}
          aria-current={t.href === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
