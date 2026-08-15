import { apportionByWeight } from './apportionment'

export interface BulkAllocation {
  readonly listId: string
  readonly percentage: number
}

/** Department-wide, mutually exclusive shares applied after local overrides. */
export interface BulkRule {
  readonly allocations: readonly BulkAllocation[]
}

/** Stored by versions of the simulator released before multi-list allocation. */
export interface LegacyBulkRule {
  readonly listId: string | null
  readonly percentage: number
}

export type BulkRuleInput = BulkRule | LegacyBulkRule

export interface BulkDistribution {
  readonly votesByList: Readonly<Record<string, number>>
  readonly assignedElectors: number
  readonly totalPercentage: number
  readonly adjusted: boolean
}

export interface ScenarioTotalsInput<Nuance extends string = string> {
  readonly listIds: readonly string[]
  readonly electorateByNuance: Partial<Record<Nuance, number>>
  readonly bulkRules: Partial<Record<Nuance, BulkRule>>
  readonly electorAssignments: Readonly<Record<string, readonly string[]>>
  readonly electorNuances: Readonly<Record<string, Nuance>>
  readonly extraAssignments: Readonly<Record<string, Readonly<Record<string, number>>>>
  readonly extraNuances: Readonly<Record<string, Nuance>>
  readonly extraDelegateCounts: Readonly<Record<string, number>>
  /**
   * Sous-pool communal déjà compris dans `electorateByNuance`.
   * Il sert uniquement à réserver les corrections locales avant les règles globales.
   */
  readonly extraDelegatePools?: Readonly<
    Record<string, Readonly<Partial<Record<Nuance, number>>>>
  >
  readonly maxVotesPerElector: 1 | 2
}

export interface ScenarioTotals {
  /** Includes every declared list, even when it receives no vote. */
  readonly votesByList: Record<string, number>
  /** Number of distinct electors casting at least one valid vote. */
  readonly assignedElectors: number
  /**
   * Number of input records that could not be applied exactly. An elector,
   * additional-delegate block, or bulk rule is counted at most once.
   */
  readonly ignoredAdjustments: number
  readonly warnings: readonly string[]
}

export interface VoteLeaderEntry {
  readonly contenderId: string
  readonly votes: number
}

/** Returns a leader only when at least one vote exists and first place is unique. */
export const getUniqueVoteLeader = (
  entries: readonly VoteLeaderEntry[],
): VoteLeaderEntry | null => {
  const maximum = entries.reduce(
    (highest, entry) => Math.max(highest, Number.isFinite(entry.votes) ? entry.votes : 0),
    0,
  )
  if (maximum <= 0) return null
  const leaders = entries.filter(({ votes }) => votes === maximum)
  return leaders.length === 1 ? leaders[0] : null
}

export interface EffectiveElectorAssignmentInput<Nuance extends string = string> {
  readonly electorId: string
  /** Nuance de la liste municipale (majorité/opposition), pas l'étiquette personnelle. */
  readonly electoralNuance: Nuance
  readonly bulkRules: Partial<Record<Nuance, BulkRule>>
  readonly electorAssignments: Readonly<Record<string, readonly string[]>>
  /** Percentile déterministe compris entre 0 et 99 pour les règles partielles. */
  readonly percentile: number
}

export interface EffectiveElectorAssignment {
  readonly listIds: readonly string[]
  readonly source: 'local' | 'bulk' | 'none'
}

const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key)

/** Reads both the current rule and the former `{ listId, percentage }` shape. */
export const bulkAllocationsFor = (
  rule: BulkRuleInput | null | undefined,
): BulkAllocation[] => {
  if (!rule) return []
  if (Array.isArray((rule as BulkRule).allocations)) {
    return (rule as BulkRule).allocations.map(({ listId, percentage }) => ({
      listId,
      percentage,
    }))
  }
  const legacy = rule as LegacyBulkRule
  return legacy.listId
    ? [{ listId: legacy.listId, percentage: legacy.percentage }]
    : []
}

/** Returns the canonical persisted representation while preserving row order. */
export const normalizeBulkRule = (
  rule: BulkRuleInput | null | undefined,
): BulkRule => ({ allocations: bulkAllocationsFor(rule) })

const fitBulkAllocations = (
  rule: BulkRuleInput | null | undefined,
  validListIds?: ReadonlySet<string>,
) => {
  const allocations: Array<{ listId: string; percentage: number; order: number }> = []
  const byListId = new Map<string, number>()
  let remainingPercentage = 100
  let adjusted = false

  bulkAllocationsFor(rule).forEach((allocation, order) => {
    if (
      typeof allocation.listId !== 'string' ||
      allocation.listId.length === 0 ||
      (validListIds && !validListIds.has(allocation.listId)) ||
      !Number.isFinite(allocation.percentage)
    ) {
      adjusted = true
      return
    }

    const requested = Math.min(100, Math.max(0, allocation.percentage))
    const accepted = Math.min(remainingPercentage, requested)
    if (requested !== allocation.percentage || accepted !== requested) adjusted = true
    if (accepted <= 0) return

    const existingIndex = byListId.get(allocation.listId)
    if (existingIndex !== undefined) {
      allocations[existingIndex].percentage += accepted
      adjusted = true
    } else {
      byListId.set(allocation.listId, allocations.length)
      allocations.push({ listId: allocation.listId, percentage: accepted, order })
    }
    remainingPercentage -= accepted
  })

  return { allocations, adjusted }
}

/**
 * Apportions mutually exclusive bulk shares with the largest-remainder method.
 * The total can therefore never exceed the number of available electors.
 */
export const calculateBulkDistribution = (
  rule: BulkRuleInput | null | undefined,
  electorate: number,
  validListIds?: ReadonlySet<string>,
): BulkDistribution => {
  const capacity = integerAtLeastZero(electorate)
  const { allocations, adjusted } = fitBulkAllocations(rule, validListIds)
  const totalPercentage = allocations.reduce(
    (total, allocation) => total + allocation.percentage,
    0,
  )
  const assignedElectors = Math.min(
    capacity,
    Math.max(0, Math.round((capacity * totalPercentage) / 100)),
  )
  const apportioned = allocations.map((allocation) => {
    const exact = (capacity * allocation.percentage) / 100
    return { ...allocation, exact, votes: Math.floor(exact) }
  })
  let remainder = assignedElectors - apportioned.reduce(
    (total, allocation) => total + allocation.votes,
    0,
  )
  const remainderOrder = [...apportioned].sort(
    (left, right) =>
      (right.exact - right.votes) - (left.exact - left.votes) ||
      left.order - right.order,
  )
  for (const allocation of remainderOrder) {
    if (remainder <= 0) break
    allocation.votes += 1
    remainder -= 1
  }

  return {
    votesByList: Object.fromEntries(
      apportioned.map(({ listId, votes }) => [listId, votes]),
    ),
    assignedElectors,
    totalPercentage,
    adjusted,
  }
}

/** Resolves the visible assignment with an explicit local override first. */
export const getEffectiveElectorAssignment = <Nuance extends string>(
  input: EffectiveElectorAssignmentInput<Nuance>,
): EffectiveElectorAssignment => {
  if (own(input.electorAssignments, input.electorId)) {
    return {
      listIds: input.electorAssignments[input.electorId] ?? [],
      source: 'local',
    }
  }

  const { allocations } = fitBulkAllocations(
    input.bulkRules[input.electoralNuance],
  )
  if (input.percentile < 0 || input.percentile >= 100) {
    return { listIds: [], source: 'none' }
  }
  let lowerBound = 0
  for (const allocation of allocations) {
    const upperBound = lowerBound + allocation.percentage
    if (input.percentile >= lowerBound && input.percentile < upperBound) {
      return { listIds: [allocation.listId], source: 'bulk' }
    }
    lowerBound = upperBound
  }
  return { listIds: [], source: 'none' }
}

const integerAtLeastZero = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

const requiredBallots = (votes: readonly number[], maxVotesPerElector: 1 | 2) => {
  const sum = votes.reduce((total, value) => total + value, 0)
  const largest = votes.reduce((maximum, value) => Math.max(maximum, value), 0)
  return Math.max(largest, Math.ceil(sum / maxVotesPerElector))
}

/** Counts distinct electors represented by aggregate candidate/list marks. */
export const countAssignedElectorsFromVotes = (
  requested: Readonly<Record<string, number>>,
  listIds: readonly string[],
  delegateCapacity: number,
  maxVotesPerElector: 1 | 2,
) => {
  const fitted = fitDelegateVotes(
    requested,
    listIds,
    integerAtLeastZero(delegateCapacity),
    maxVotesPerElector,
  )
  return requiredBallots(
    listIds.map((listId) => fitted[listId] ?? 0),
    maxVotesPerElector,
  )
}

/**
 * Restricts aggregate candidate votes to what `delegateCapacity` distinct
 * ballot papers can legally contain. Earlier ids in `listIds` have priority
 * when aggregate input has to be truncated, making the result deterministic.
 */
const fitDelegateVotes = (
  requested: Readonly<Record<string, number>>,
  listIds: readonly string[],
  delegateCapacity: number,
  maxVotesPerElector: 1 | 2,
) => {
  const votes: Record<string, number> = {}
  let remainingMarks = delegateCapacity * maxVotesPerElector

  for (const listId of listIds) {
    const accepted = Math.min(
      integerAtLeastZero(requested[listId]),
      delegateCapacity,
      remainingMarks,
    )
    votes[listId] = accepted
    remainingMarks -= accepted
  }

  return votes
}

/**
 * Computes a scenario without mutating its inputs.
 *
 * Explicit electors are reserved first (including an explicit abstention),
 * then additional-delegate blocks, then the department-wide bulk rule on the
 * unreserved remainder of each political nuance. This ordering prevents a
 * local adjustment from being counted a second time by a bulk percentage.
 */
export const calculateScenarioTotals = <Nuance extends string>(
  input: ScenarioTotalsInput<Nuance>,
): ScenarioTotals => {
  const warnings: string[] = []
  let ignoredAdjustments = 0
  let assignedElectors = 0

  const listIds: string[] = []
  const validListIds = new Set<string>()
  for (const listId of input.listIds) {
    if (validListIds.has(listId)) {
      warnings.push(`Identifiant de liste dupliqué ignoré : ${listId}.`)
      continue
    }
    validListIds.add(listId)
    listIds.push(listId)
  }

  const votesByList: Record<string, number> = Object.fromEntries(
    listIds.map((listId) => [listId, 0]),
  )
  const remainingByNuance = new Map<string, number>()
  let totalElectorate = 0

  for (const nuance of Object.keys(input.electorateByNuance).sort()) {
    const rawCount = input.electorateByNuance[nuance as Nuance]
    const count = integerAtLeastZero(rawCount)
    remainingByNuance.set(nuance, count)
    totalElectorate += count
    if (rawCount !== undefined && rawCount !== count) {
      warnings.push(`Effectif officiel invalide pour la nuance ${nuance}, ramené à ${count}.`)
    }
  }

  for (const electorId of Object.keys(input.electorAssignments).sort()) {
    const assignedIds = input.electorAssignments[electorId] ?? []
    const nuance = input.electorNuances[electorId]
    let recordAdjusted = false

    if (nuance === undefined || !remainingByNuance.has(nuance)) {
      ignoredAdjustments += 1
      warnings.push(`Ajustement ignoré pour ${electorId} : nuance absente du collège.`)
      continue
    }

    const remaining = remainingByNuance.get(nuance) ?? 0
    if (remaining <= 0) {
      ignoredAdjustments += 1
      warnings.push(`Ajustement ignoré pour ${electorId} : capacité ${nuance} épuisée.`)
      continue
    }

    // An explicit empty array is a deliberate abstention/override. It still
    // reserves this elector so that the bulk rule cannot count them again.
    remainingByNuance.set(nuance, remaining - 1)
    const acceptedIds: string[] = []
    const seen = new Set<string>()

    for (const listId of assignedIds) {
      if (
        !validListIds.has(listId) ||
        seen.has(listId) ||
        acceptedIds.length >= input.maxVotesPerElector
      ) {
        recordAdjusted = true
        continue
      }
      seen.add(listId)
      acceptedIds.push(listId)
    }

    if (recordAdjusted) {
      ignoredAdjustments += 1
      warnings.push(`Choix invalides, dupliqués ou excédentaires retirés pour ${electorId}.`)
    }

    if (acceptedIds.length > 0) assignedElectors += 1
    for (const listId of acceptedIds) votesByList[listId] += 1
  }

  for (const communeCode of Object.keys(input.extraAssignments).sort()) {
    const rawAssignments = input.extraAssignments[communeCode] ?? {}
    const hasPositiveInput = Object.values(rawAssignments).some(
      (value) => Number.isFinite(value) && value > 0,
    )
    if (!hasPositiveInput) continue

    let recordAdjusted = false
    const markAdjusted = () => {
      recordAdjusted = true
    }
    const requested: Record<string, number> = {}

    for (const [listId, rawVotes] of Object.entries(rawAssignments)) {
      if (!Number.isFinite(rawVotes) || rawVotes <= 0) continue
      if (!validListIds.has(listId)) {
        markAdjusted()
        continue
      }
      const votes = Math.floor(rawVotes)
      if (votes !== rawVotes) markAdjusted()
      if (votes > 0) requested[listId] = votes
    }

    const hasDetailedPool = input.extraDelegatePools !== undefined &&
      own(input.extraDelegatePools, communeCode)
    const legacyNuance = input.extraNuances[communeCode]
    const detailedPool: Readonly<Partial<Record<Nuance, number>>> =
      input.extraDelegatePools?.[communeCode] ??
      ({} as Partial<Record<Nuance, number>>)
    const rawPoolEntries: Array<[string, number | undefined]> = hasDetailedPool
      ? Object.keys(detailedPool).map((nuance) => [
          nuance,
          detailedPool[nuance as Nuance],
        ])
      : legacyNuance === undefined
        ? []
        : [[legacyNuance, input.extraDelegateCounts[communeCode]]]
    const poolByNuance: Record<string, number> = {}
    rawPoolEntries.forEach(([nuance, rawCount]) => {
      const count = integerAtLeastZero(rawCount)
      if (count <= 0 || !remainingByNuance.has(nuance)) return
      poolByNuance[nuance] = (poolByNuance[nuance] ?? 0) + count
    })
    const delegateCount = Object.values(poolByNuance).reduce(
      (total, count) => total + count,
      0,
    )
    if (
      delegateCount <= 0 ||
      Object.keys(requested).length === 0
    ) {
      ignoredAdjustments += 1
      warnings.push(
        `Bloc de délégués ignoré pour ${communeCode} : nuance, effectif ou liste invalide.`,
      )
      continue
    }

    const legalRequest = fitDelegateVotes(
      requested,
      listIds,
      delegateCount,
      input.maxVotesPerElector,
    )
    if (listIds.some((listId) => legalRequest[listId] !== (requested[listId] ?? 0))) {
      markAdjusted()
    }

    const requestedElectors = requiredBallots(
      listIds.map((listId) => legalRequest[listId]),
      input.maxVotesPerElector,
    )
    const availableByNuance: Record<string, number> = {}
    Object.entries(poolByNuance).forEach(([nuance, poolCount]) => {
      const available = Math.min(poolCount, remainingByNuance.get(nuance) ?? 0)
      if (available > 0) availableByNuance[nuance] = available
    })
    const availableCapacity = Object.values(availableByNuance).reduce(
      (total, count) => total + count,
      0,
    )
    const acceptedCapacity = Math.min(requestedElectors, availableCapacity)
    const acceptedVotes = fitDelegateVotes(
      legalRequest,
      listIds,
      acceptedCapacity,
      input.maxVotesPerElector,
    )
    const acceptedElectors = requiredBallots(
      listIds.map((listId) => acceptedVotes[listId]),
      input.maxVotesPerElector,
    )

    if (acceptedElectors < requestedElectors) markAdjusted()
    if (recordAdjusted) {
      ignoredAdjustments += 1
      warnings.push(`Bloc de délégués ${communeCode} tronqué à la capacité disponible.`)
    }

    const reservedByNuance = apportionByWeight(
      acceptedElectors,
      availableByNuance,
    )
    Object.entries(reservedByNuance).forEach(([nuance, reserved]) => {
      if (reserved <= 0) return
      remainingByNuance.set(
        nuance,
        Math.max(0, (remainingByNuance.get(nuance) ?? 0) - reserved),
      )
    })
    assignedElectors += acceptedElectors
    for (const listId of listIds) votesByList[listId] += acceptedVotes[listId]
  }

  for (const [nuance, remaining] of [...remainingByNuance.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!own(input.bulkRules, nuance)) continue
    const rule = input.bulkRules[nuance as Nuance]
    if (!rule) continue
    const distribution = calculateBulkDistribution(rule, remaining, validListIds)
    if (distribution.adjusted) {
      ignoredAdjustments += 1
      warnings.push(`Répartition globale ${nuance} ajustée aux listes et aux 100 % disponibles.`)
    }
    for (const [listId, votes] of Object.entries(distribution.votesByList)) {
      votesByList[listId] += votes
    }
    assignedElectors += distribution.assignedElectors
  }

  return {
    votesByList,
    assignedElectors: Math.min(totalElectorate, assignedElectors),
    ignoredAdjustments,
    warnings,
  }
}
