"use client";

import { useState } from "react";
import { useTOptional } from "@/i18n";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "size"> & {
  checked: boolean;
  /** Hide the روشن/خاموش text when the surrounding label already states the value. */
  hideState?: boolean;
  size?: "sm" | "md";
};

const ON = "#10b981";
const OFF = "#a1a1aa";

function stateText(t: (key: string) => string, on: boolean) {
  const key = on ? "common.switchOn" : "common.switchOff";
  const value = t(key);
  if (value && value !== key) return value;
  // Premium bundles can run on hosts whose catalog predates these keys.
  const fa = typeof document !== "undefined" && document.documentElement.lang === "fa";
  return on ? (fa ? "روشن" : "On") : fa ? "خاموش" : "Off";
}

/**
 * On/off control: a native checkbox exposed as role="switch", drawn as a track and thumb
 * with a visible state word. It keeps every handler of the input it replaces, so swapping
 * `<input type="checkbox">` for `<SwitchInput>` changes appearance only.
 *
 * Styles are inline on purpose: premium bundles compile this file and may run on an older
 * host whose stylesheet has no switch rules.
 */
export function SwitchInput({ checked, hideState, size = "md", className, style, disabled, onFocus, onBlur, ...rest }: Props) {
  const t = useTOptional();
  const [focusRing, setFocusRing] = useState(false);
  const w = size === "sm" ? 36 : 44;
  const h = size === "sm" ? 20 : 24;
  const knob = h - 6;

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, verticalAlign: "middle", ...style }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-block",
          width: w,
          height: h,
          flexShrink: 0,
          borderRadius: 9999,
          background: checked ? ON : OFF,
          boxShadow: focusRing ? "0 0 0 3px rgb(59 130 246 / 0.55)" : "inset 0 1px 2px rgb(0 0 0 / 0.15)",
          opacity: disabled ? 0.45 : 1,
          transition: "background-color 160ms ease, box-shadow 160ms ease",
        }}
      >
        <input
          {...rest}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onFocus={(e) => {
            setFocusRing(e.currentTarget.matches(":focus-visible"));
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocusRing(false);
            onBlur?.(e);
          }}
          style={{
            position: "absolute",
            inset: -10,
            width: "calc(100% + 20px)",
            height: "calc(100% + 20px)",
            margin: 0,
            opacity: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            zIndex: 1,
          }}
        />
        <span
          aria-hidden
          className="motion-reduce:!transition-none"
          style={{
            position: "absolute",
            top: 3,
            insetInlineStart: checked ? w - knob - 3 : 3,
            width: knob,
            height: knob,
            borderRadius: 9999,
            background: "#fff",
            boxShadow: "0 1px 3px rgb(0 0 0 / 0.3)",
            transition: "inset-inline-start 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        />
      </span>
      {hideState ? null : (
        <span
          aria-hidden
          className={checked ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"}
          style={{ fontSize: 11, fontWeight: 600, minWidth: 34, lineHeight: 1 }}
        >
          {stateText(t, checked)}
        </span>
      )}
    </span>
  );
}
