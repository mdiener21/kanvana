function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getChartTheme() {
  return {
    text: cssVar('--text', '#111827'),
    muted: cssVar('--text-muted', '#6b7280'),
    border: cssVar('--border', '#d1d5db'),
    borderSubtle: cssVar('--border-subtle', '#e5e7eb'),
    surface: cssVar('--surface', '#ffffff')
  };
}
