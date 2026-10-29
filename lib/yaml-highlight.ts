// YAML → HTML with highlight classes (pure, unit-tested in yaml-highlight.test.ts). Used by components/ui/YamlEditor.tsx.
// Keys .y-key, strings .y-str, numbers/booleans .y-lit, comments .y-com, «-» «:» «|-» .y-pun. Text is always escaped.

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function value(v: string): string {
  const t = v.trim();
  if (!t) return esc(v);
  const wrap = (cls: string) => esc(v.slice(0, v.indexOf(t))) + `<span class="${cls}">${esc(t)}</span>` + esc(v.slice(v.indexOf(t) + t.length));
  if (/^(true|false|null|~|-?\d+(\.\d+)?)$/.test(t)) return wrap("y-lit");
  if (/^[|>][-+]?$/.test(t) || t === "[]" || t === "{}") return wrap("y-pun");
  return wrap("y-str");
}

export function highlightYaml(text: string): string {
  let block = -1; // indent of the key that opened a «|» / «>» block: deeper lines are plain text
  return text.split("\n").map((line) => {
    const indent = (line.match(/^\s*/) ?? [""])[0].length;
    if (block >= 0 && (!line.trim() || indent > block)) return `<span class="y-str">${esc(line)}</span>`;
    block = -1;
    if (/^\s*(- )?[^:#\s][^:#]*?:\s*[|>][-+]?\s*$/.test(line)) block = indent;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(\s*)(#.*)$/))) return m[1] + `<span class="y-com">${esc(m[2])}</span>`;
    if ((m = line.match(/^(\s*)(- )?([^:#\s][^:#]*?)(:)(\s.*|)$/))) {
      return m[1] + (m[2] ? '<span class="y-pun">- </span>' : "") + `<span class="y-key">${esc(m[3])}</span><span class="y-pun">:</span>` + value(m[5]);
    }
    if ((m = line.match(/^(\s*)(- )(.*)$/))) return m[1] + '<span class="y-pun">- </span>' + value(m[3]);
    return esc(line);
  }).join("\n") + "\n"; // the trailing newline keeps the <pre> as tall as the textarea
}
