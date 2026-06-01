export type ThemeMode = "light" | "dark";

type ThemeSource = {
  mode: ThemeMode;
  explicit: boolean;
};

const THEME_HINT_SELECTORS = [
  "[data-theme]",
  "[class~='dark']",
  "[class~='light']",
  "[class~='mdbook-dark']",
  "[class~='mdbook-light']",
  "[class~='theme-dark']",
  "[class~='theme-light']",
].join(",");

export interface ThemeController {
  destroy(): void;
}

export function createAdaptiveThemeController(
  widgetRoot: HTMLElement,
): ThemeController {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const refresh = (): void => {
    const { mode } = resolveTheme(widgetRoot, mediaQuery.matches);
    widgetRoot.dataset.tpTheme = mode;
  };

  refresh();

  const observer = new MutationObserver(() => refresh());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme", "style"],
  });
  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
  }

  const onMediaChange = () => refresh();
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", onMediaChange);
  } else {
    mediaQuery.addListener(onMediaChange);
  }

  return {
    destroy() {
      observer.disconnect();
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", onMediaChange);
      } else {
        mediaQuery.removeListener(onMediaChange);
      }
    },
  };
}

function resolveTheme(widgetRoot: HTMLElement, prefersDark: boolean): ThemeSource {
  const hinted = findThemeHint(widgetRoot);
  if (hinted) return hinted;

  return { mode: prefersDark ? "dark" : "light", explicit: false };
}

function findThemeHint(widgetRoot: HTMLElement): ThemeSource | null {
  const explicitCandidates = widgetRoot.closest(THEME_HINT_SELECTORS);
  const roots: HTMLElement[] = [];

  if (explicitCandidates instanceof HTMLElement) {
    roots.push(explicitCandidates);
  }
  if (document.body) roots.push(document.body);
  roots.push(document.documentElement);

  for (const element of roots) {
    const attr = normalizeThemeValue(
      element.getAttribute("data-theme"),
    );
    if (attr) return { mode: attr, explicit: true };

    const classHint = themeFromClassList(element.classList);
    if (classHint) return { mode: classHint, explicit: true };
  }

  return null;
}

function normalizeThemeValue(value: string | null): ThemeMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("dark")) return "dark";
  if (normalized.includes("light")) return "light";
  return null;
}

function themeFromClassList(classList: DOMTokenList): ThemeMode | null {
  if (classList.contains("dark") || classList.contains("mdbook-dark") || classList.contains("theme-dark")) {
    return "dark";
  }
  if (classList.contains("light") || classList.contains("mdbook-light") || classList.contains("theme-light")) {
    return "light";
  }
  return null;
}


