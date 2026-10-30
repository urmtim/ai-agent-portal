"use client";

import { useState } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const EYE = <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const EYE_OFF = (
  <svg width="18" height="18" viewBox="0 0 24 24" {...S} aria-hidden="true">
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M3 3l18 18" />
  </svg>
);

/**
 * A token / password field with an eye button to show what was typed.
 * It is a text field whose characters are hidden by CSS: with no password field in the form, the browser's
 * password manager doesn't take the window for a sign-in form and offers no saved logins. Browsers without
 * that CSS get a plain password field. (Only rendered in open dialogs, never on the server.)
 */
export function SecretInput({ label = "токен", className, ...input }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const [maskByCss] = useState(() => typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc"));
  const masked = !show && maskByCss;
  return (
    <div className="pwd">
      <input autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true" {...input}
        className={[className, masked ? "masked" : ""].filter(Boolean).join(" ") || undefined}
        type={show || maskByCss ? "text" : "password"} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? `Скрыть ${label}` : `Показать ${label}`} title={show ? "Скрыть" : "Показать"}>
        {show ? EYE_OFF : EYE}
      </button>
    </div>
  );
}
