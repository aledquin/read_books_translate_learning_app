/** Vite `base` (e.g. `/` or `/reader/`). Use for fetches to `public/`. */
export function publicUrl(pathWithoutLeadingSlash: string): string {
  const base = import.meta.env.BASE_URL
  const clean = pathWithoutLeadingSlash.replace(/^\/+/, '')
  return `${base}${clean}`
}
