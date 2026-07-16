/**
 * Shared people helpers for AG Project Monitor.
 * Assignee lists are ordered by task frequency, not alphabetically:
 * Κωνσταντίνα πρώτη, μετά Βάσω, μετά Γωγώ, μετά οι υπόλοιποι.
 */

const PREFERRED_ORDER = [
  ['κωνσταντίνα', 'konstantina'],
  ['βάσω', 'βασω', 'vaso'],
  ['γωγώ', 'γωγω', 'gogo'],
]

function preferredRank(fullName) {
  const name = (fullName || '').toLocaleLowerCase('el-GR')
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (PREFERRED_ORDER[i].some(alias => name.includes(alias))) return i
  }
  return PREFERRED_ORDER.length
}

export function sortProfiles(profiles) {
  return [...(profiles || [])].sort((a, b) => {
    const rankDiff = preferredRank(a.full_name) - preferredRank(b.full_name)
    if (rankDiff !== 0) return rankDiff
    return (a.full_name || '').localeCompare(b.full_name || '', 'el-GR')
  })
}
