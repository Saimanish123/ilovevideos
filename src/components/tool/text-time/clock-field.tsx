"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseClock } from "@/tools/engines/time-overlay/options";

/**
 * A time typed as m:ss, h:mm:ss or plain seconds. Free typing while focused; read on blur or Enter;
 * an empty field means "automatic" (`undefined`), shown as the placeholder; a value that is not a
 * time goes back to what it was.
 */
export function ClockField({
  id,
  value,
  placeholder,
  onCommit,
  disabled,
  format,
  "aria-describedby": describedBy,
}: {
  id: string;
  value: number | undefined;
  placeholder: string;
  onCommit: (seconds: number | undefined) => void;
  disabled?: boolean;
  format: (seconds: number) => string;
  "aria-describedby"?: string;
}) {
  const shown = value === undefined ? "" : format(value);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const commit = () => {
    setEditing(false);
    if (text.trim() === "") {
      onCommit(undefined);
      return;
    }
    const s = parseClock(text);
    if (s === undefined) setText(shown);
    else onCommit(s);
  };
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      className="tabular"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      aria-describedby={describedBy}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
