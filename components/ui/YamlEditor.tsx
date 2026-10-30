"use client";

import { useRef } from "react";
import { highlightYaml } from "@/lib/yaml-highlight";

/** YAML text area with highlighting: a coloured <pre> under a transparent textarea, scrolled together. */
export function YamlEditor({ value, onChange, label, readOnly }: { value: string; onChange: (text: string) => void; label: string; readOnly?: boolean }) {
  const pre = useRef<HTMLPreElement>(null);
  const sync = (ta: HTMLTextAreaElement) => {
    if (pre.current) { pre.current.scrollTop = ta.scrollTop; pre.current.scrollLeft = ta.scrollLeft; }
  };
  return (
    <div className="yamlwrap">
      {/* highlightYaml escapes the text; only its own spans are markup */}
      <pre ref={pre} aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightYaml(value) }} />
      <textarea aria-label={label} spellCheck={false} value={value} readOnly={readOnly}
        onChange={(e) => { onChange(e.target.value); sync(e.target); }} onScroll={(e) => sync(e.currentTarget)} />
    </div>
  );
}
