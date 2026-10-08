// Every look Hermes has shipped. Ids must match the [data-theme] blocks in
// themes.css; the default theme lives on :root in index.css. Swatches are
// [background, surface, accent, text] and only feed the Settings previews.
export const THEMES = [
  {
    id: 'obsidian',
    name: 'Obsidian Verdigris',
    description: 'Default. Obsidian surfaces, deep verdigris accent, serif display.',
    swatches: ['#0a0d0c', '#111615', '#0b7a61', '#e8ece9'],
  },
  {
    id: 'patina',
    name: 'Patina Blueprint',
    description: 'Bright verdigris and bronze glow over a faint blueprint grid.',
    swatches: ['#0b0e0d', '#111514', '#35c29c', '#e8ece8'],
  },
  {
    id: 'charcoal',
    name: 'Warm Charcoal',
    description: 'Soft charcoal dark mode with a clay-coral accent.',
    swatches: ['#1f1d1b', '#292623', '#d2765a', '#f3efe7'],
  },
  {
    id: 'cyber-blue',
    name: 'Cyber Blue',
    description: 'The original Hermes look: midnight navy and electric blue.',
    swatches: ['#0b0f19', '#121826', '#3b82f6', '#ffffff'],
  },
  {
    id: 'cream',
    name: 'Cream & Evergreen',
    description: 'Light. Warm paper surfaces with a deep evergreen accent.',
    swatches: ['#f3eee2', '#fcfaf4', '#1f6f5c', '#272319'],
  },
  {
    id: 'parchment',
    name: 'Parchment & Plum',
    description: 'Light. Bone parchment surfaces with a deep plum accent.',
    swatches: ['#f1ede5', '#faf8f2', '#6d3f74', '#2a2621'],
  },
];

export const DEFAULT_THEME = 'obsidian';
const STORAGE_KEY = 'hermes.theme';

const isKnown = (id) => THEMES.some(t => t.id === id);

// Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and falls back to the default theme.
export function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isKnown(saved)) return saved;
  } catch { /* fall through to default */ }
  return DEFAULT_THEME;
}

export function applyTheme(id) {
  const theme = isKnown(id) ? id : DEFAULT_THEME;
  // The default theme is the bare :root, so it needs no attribute.
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* not persisted */ }
}
