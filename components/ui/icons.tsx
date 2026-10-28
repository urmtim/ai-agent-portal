// Line icons from the mockup (24px grid, stroke = currentColor).

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const ICONS = {
  edit: <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>,
  del: <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>,
  run: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>,
  send: <svg width="16" height="16" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>,
  search: <svg width="15" height="15" viewBox="0 0 24 24" {...S} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
};

export type IconName = keyof typeof ICONS;

export function IconButton({
  icon,
  title,
  ...rest
}: { icon: IconName; title: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title">) {
  return (
    <button type="button" className={icon === "del" ? "ibtn del" : "ibtn"} title={title} aria-label={title} {...rest}>
      {ICONS[icon]}
    </button>
  );
}
