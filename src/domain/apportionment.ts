import type { CommuneProfile } from '../data/demo'
import type { Nuance } from '../data/election2026'

const integerAtLeastZero = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0

/**
 * Hamilton apportionment with a stable lexical tie-breaker.
 *
 * Invalid and non-positive weights are ignored. The returned object retains
 * every input key so callers can safely read zero-capacity entries.
 */
export const apportionByWeight = (
  total: number,
  weights: Readonly<Record<string, number>>,
): Record<string, number> => {
  const capacity = integerAtLeastZero(total)
  const positive = Object.entries(weights)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .map(([id, weight]) => [id, Math.floor(weight)] as const)
  const weightTotal = positive.reduce((sum, [, weight]) => sum + weight, 0)
  const result: Record<string, number> = Object.fromEntries(
    Object.keys(weights).map((id) => [id, 0]),
  )
  if (capacity === 0 || weightTotal === 0) return result

  const shares = positive.map(([id, weight]) => {
    const exact = (capacity * weight) / weightTotal
    return { id, exact, allocated: Math.floor(exact) }
  })
  let remainder = capacity - shares.reduce(
    (sum, share) => sum + share.allocated,
    0,
  )
  for (const share of [...shares].sort(
    (left, right) =>
      (right.exact - right.allocated) - (left.exact - left.allocated) ||
      left.id.localeCompare(right.id),
  )) {
    if (remainder <= 0) break
    share.allocated += 1
    remainder -= 1
  }
  shares.forEach(({ id, allocated }) => {
    result[id] = allocated
  })
  return result
}

/**
 * Estimates additional delegates from the political balance of the council.
 * Groups sharing a nuance are combined before Hamilton rounding.
 */
export const allocateExtraDelegatesByNuance = (
  profile: CommuneProfile,
): Partial<Record<Nuance, number>> => {
  const total = integerAtLeastZero(profile.extraDelegates)
  const weights: Record<string, number> = {}

  for (const group of profile.groups) {
    const seats = group.electors.length
    if (seats <= 0) continue
    weights[group.nuance] = (weights[group.nuance] ?? 0) + seats
  }

  if (Object.keys(weights).length === 0) {
    return total > 0 ? { [profile.mayorNuance]: total } : {}
  }

  return apportionByWeight(total, weights) as Partial<Record<Nuance, number>>
}
