export function camelize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(camelize) as T;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelize(item)])) as T;
}
