// Tiny localStorage wrapper. Single key holds the entire app state.
const KEY = "j2d_advanced_v1";

const DEFAULT_STATE = {
  theme: "dark",
  projects: {}, // id -> Project
  lastOptions: null,
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to persist state", e);
  }
}

export function patchState(patch) {
  const cur = loadState();
  const next = { ...cur, ...patch };
  saveState(next);
  return next;
}
