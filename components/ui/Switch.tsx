"use client";

/** iOS-style switch: a knob sliding along an oval (globals.css .switch). The checkbox is submitted as `name` = "on". */
export function Switch({ checked, onChange, label, name, disabled }: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: React.ReactNode;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span>{label}</span>
    </label>
  );
}
