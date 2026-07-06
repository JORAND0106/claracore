/**
 * Campo de fecha con selector de calendario nativo; bloquea escritura manual.
 */
import { useRef } from "react";

export function normalizeDateInputValue(val) {
  if (val == null || val === "") return "";
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

const ALLOWED_KEYS = new Set([
  "Tab",
  "Escape",
  "Enter",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export default function CcDatePickerInput({
  value,
  onChange,
  style,
  min,
  max,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}) {
  const ref = useRef(null);

  const openPicker = () => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* Safari / contexto sin gesto de usuario */
      }
    }
    el.focus();
  };

  const blockManualEdit = (e) => {
    if (ALLOWED_KEYS.has(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
  };

  return (
    <input
      ref={ref}
      id={id}
      type="date"
      value={normalizeDateInputValue(value)}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      inputMode="none"
      autoComplete="off"
      onChange={(e) => onChange(normalizeDateInputValue(e.target.value))}
      onKeyDown={blockManualEdit}
      onBeforeInput={(e) => {
        if (e.inputType === "insertText" || e.inputType === "insertFromPaste" || e.inputType === "insertReplacementText") {
          e.preventDefault();
        }
      }}
      onPaste={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onClick={openPicker}
      onFocus={openPicker}
      style={{ cursor: disabled ? "not-allowed" : "pointer", ...style }}
    />
  );
}
