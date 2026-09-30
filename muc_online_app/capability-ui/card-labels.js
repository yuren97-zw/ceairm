export const CARD_LABEL_KEYS_KEY = "authorization-card-label-projects";

export function defaultCardLabelKeys(projects) {
  return projects
    .filter((project) => project.pinned)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
    .map((project) => project.key);
}

export function normalizeCardLabelKeys(projects, savedKeys) {
  const available = new Set(projects.map((project) => project.key));
  const valid = Array.isArray(savedKeys) ? [...new Set(savedKeys)].filter((key) => available.has(key)) : [];
  return valid.length ? valid : defaultCardLabelKeys(projects);
}

export function readCardLabelKeys(projects) {
  try {
    return normalizeCardLabelKeys(projects, JSON.parse(localStorage.getItem(CARD_LABEL_KEYS_KEY) || "[]"));
  } catch {
    return defaultCardLabelKeys(projects);
  }
}
