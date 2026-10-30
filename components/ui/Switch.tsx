"use client";

/**
 * iOS-style switch: a knob sliding along an oval (globals.css .switch). The checkbox is submitted as `name` = "on".
 * Without a label it is just the slider; then `title` says what it means (hover and screen readers).
 */
export function Switch({ checked, onChange, label, title, name, disabled }: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label?: React.ReactNode;
  title?: string;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch" title={title}>
      <input type="checkbox" role="switch" name={name} checked={checked} disabled={disabled} aria-label={label ? undefined : title}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      {label && <span>{label}</span>}
    </label>
  );
}
