export const ADMIN_GAMERTAGS = ['anneowo6379']

export function isAdminGamertag(gamertag?: string | null): boolean {
  const normalized = (gamertag || '').trim().toLowerCase()
  return Boolean(normalized) && ADMIN_GAMERTAGS.includes(normalized)
}
