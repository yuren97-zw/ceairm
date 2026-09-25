export const PRIORITY_PROJECTS_KEY = "authorization-priority-projects";

export function defaultPriorityProjectKeys(projects) {
  return projects
    .filter((project) => project.pinned)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code))
    .map((project) => project.key);
}

export function normalizePriorityProjectKeys(projects, savedKeys) {
  const available = new Set(projects.map((project) => project.key));
  const valid = Array.isArray(savedKeys) ? [...new Set(savedKeys)].filter((key) => available.has(key)) : [];
  return valid.length ? valid : defaultPriorityProjectKeys(projects);
}

export function readPriorityProjectKeys(projects) {
  try {
    return normalizePriorityProjectKeys(projects, JSON.parse(localStorage.getItem(PRIORITY_PROJECTS_KEY) || "[]"));
  } catch {
    return defaultPriorityProjectKeys(projects);
  }
}
