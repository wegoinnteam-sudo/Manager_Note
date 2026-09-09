import { useCallback, useEffect, useState } from "react";

export type FontSize = "sm" | "md" | "lg" | "xl";
export type FontWeight = "normal" | "bold";
export type FontFamily = "sans" | "gothic" | "serif" | "mono";

const FONT_SIZE_KEY = "th_font_size";
const FONT_WEIGHT_KEY = "th_font_weight";
const FONT_FAMILY_KEY = "th_font_family";

const FONT_SIZES: FontSize[] = ["sm", "md", "lg", "xl"];
const FONT_WEIGHTS: FontWeight[] = ["normal", "bold"];
const FONT_FAMILIES: FontFamily[] = ["sans", "gothic", "serif", "mono"];

// Most of index.css sets font-size in fixed px rather than relative units,
// so a body-level font-size change wouldn't cascade into most of the app.
// `zoom` scales the whole rendered app proportionally (text, spacing,
// icons together) without needing to touch every rule.
const FONT_SIZE_SCALE: Record<FontSize, string> = {
  sm: "0.9",
  md: "1",
  lg: "1.15",
  xl: "1.3",
};

const FONT_WEIGHT_VALUE: Record<FontWeight, string> = {
  normal: "400",
  bold: "700",
};

const FONT_FAMILY_STACK: Record<FontFamily, string> = {
  sans: "var(--font-sans)",
  gothic: '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  serif: '"Nanum Myeongjo", Batang, serif',
  mono: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
};

function readStored<T extends string>(key: string, valid: T[], fallback: T): T {
  const stored = localStorage.getItem(key);
  return (valid as string[]).includes(stored ?? "") ? (stored as T) : fallback;
}

function apply(fontSize: FontSize, fontWeight: FontWeight, fontFamily: FontFamily) {
  const root = document.documentElement.style;
  root.setProperty("--user-font-scale", FONT_SIZE_SCALE[fontSize]);
  root.setProperty("--user-font-weight", FONT_WEIGHT_VALUE[fontWeight]);
  root.setProperty("--user-font-family", FONT_FAMILY_STACK[fontFamily]);
}

/**
 * Per-device display preferences (font size/weight/family), stored in
 * localStorage — same pattern as useTheme (per-browser, not synced across
 * a user's devices, not visible to teammates).
 */
export function useDisplaySettings() {
  const [fontSize, setFontSizeState] = useState<FontSize>(() => readStored(FONT_SIZE_KEY, FONT_SIZES, "md"));
  const [fontWeight, setFontWeightState] = useState<FontWeight>(() => readStored(FONT_WEIGHT_KEY, FONT_WEIGHTS, "normal"));
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(() => readStored(FONT_FAMILY_KEY, FONT_FAMILIES, "sans"));

  useEffect(() => {
    apply(fontSize, fontWeight, fontFamily);
  }, [fontSize, fontWeight, fontFamily]);

  const setFontSize = useCallback((next: FontSize) => {
    localStorage.setItem(FONT_SIZE_KEY, next);
    setFontSizeState(next);
  }, []);
  const setFontWeight = useCallback((next: FontWeight) => {
    localStorage.setItem(FONT_WEIGHT_KEY, next);
    setFontWeightState(next);
  }, []);
  const setFontFamily = useCallback((next: FontFamily) => {
    localStorage.setItem(FONT_FAMILY_KEY, next);
    setFontFamilyState(next);
  }, []);

  return { fontSize, fontWeight, fontFamily, setFontSize, setFontWeight, setFontFamily };
}
