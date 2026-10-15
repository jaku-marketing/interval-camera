export const defaults = Object.freeze({ interval: 5, delay: 5, total: 10, orientation: 'portrait', facing: 'environment', grid: true });
export const choices = Object.freeze({ interval: [5, 10, 30, 60], delay: [0, 5, 10], total: [3, 10, 30, 50], orientation: ['portrait', 'landscape'], facing: ['environment', 'user'] });
export function normalizePreferences(input) {
  const result = { ...defaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const [key, allowed] of Object.entries(choices)) if (allowed.includes(input[key])) result[key] = input[key];
  if (typeof input.grid === 'boolean') result.grid = input.grid;
  return result;
}
