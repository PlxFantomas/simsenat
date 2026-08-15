import type { CommuneProfile } from '../data/demo'
import {
  allocateExtraDelegatesByNuance,
  apportionByWeight,
} from './apportionment'
import type { BulkRule } from './scenario'
import {
  calculateBulkDistribution,
  countAssignedElectorsFromVotes,
} from './scenario'

export interface CommuneCoverage {
  readonly profile: CommuneProfile
  readonly councilAssigned: number
  readonly councilTotal: number
  readonly extraAssigned: number
  readonly extraTotal: number
  readonly assigned: number
  readonly total: number
  readonly remaining: number
}

export interface CommuneCoverageInput<Nuance extends string> {
  readonly profile: CommuneProfile
  readonly listIds: readonly string[]
  readonly bulkRules: Partial<Record<Nuance, BulkRule>>
  readonly electorAssignments: Readonly<Record<string, readonly string[]>>
  readonly extraAssignments: Readonly<Record<string, number>>
  readonly maxVotesPerElector: 1 | 2
}

export interface ExtraDelegateState {
  readonly poolByNuance: Readonly<Record<string, number>>
  readonly manuallyAssigned: number
  readonly bulkAssigned: number
  readonly bulkVotesByList: Readonly<Record<string, number>>
  readonly assigned: number
}

const own = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key)

const integerAtLeastZero = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0

export const calculateExtraDelegateState = <Nuance extends string>({
  profile,
  listIds,
  bulkRules,
  extraAssignments,
  maxVotesPerElector,
}: CommuneCoverageInput<Nuance>): ExtraDelegateState => {
  const validListIds = new Set(listIds)
  const poolByNuance = allocateExtraDelegatesByNuance(profile)
  const manuallyAssigned = countAssignedElectorsFromVotes(
    extraAssignments,
    listIds,
    profile.extraDelegates,
    maxVotesPerElector,
  )
  const manuallyReservedByNuance = apportionByWeight(
    manuallyAssigned,
    poolByNuance,
  )
  const bulkVotesByList: Record<string, number> = Object.fromEntries(
    listIds.map((listId) => [listId, 0]),
  )
  let bulkAssigned = 0

  for (const [nuance, capacity] of Object.entries(poolByNuance)) {
    const remaining = Math.max(
      0,
      capacity - (manuallyReservedByNuance[nuance] ?? 0),
    )
    const distribution = calculateBulkDistribution(
      bulkRules[nuance as Nuance],
      remaining,
      validListIds,
    )
    bulkAssigned += distribution.assignedElectors
    Object.entries(distribution.votesByList).forEach(([listId, votes]) => {
      bulkVotesByList[listId] = (bulkVotesByList[listId] ?? 0) + votes
    })
  }

  const assigned = Math.min(
    profile.extraDelegates,
    manuallyAssigned + bulkAssigned,
  )
  return {
    poolByNuance,
    manuallyAssigned,
    bulkAssigned,
    bulkVotesByList,
    assigned,
  }
}

/**
 * Estimates the municipal part of coverage without treating every visible
 * councillor as a grand elector when the statutory delegates are unidentified.
 */
export const calculateCommuneCoverage = <Nuance extends string>({
  profile,
  listIds,
  bulkRules,
  electorAssignments,
  extraAssignments,
  maxVotesPerElector,
}: CommuneCoverageInput<Nuance>): CommuneCoverage => {
  const validListIds = new Set(listIds)
  const councilTotal = integerAtLeastZero(
    profile.municipalDelegateCount ?? profile.councilElectors,
  )
  const extraTotal = integerAtLeastZero(profile.extraDelegates)
  const groupWeights = Object.fromEntries(
    profile.groups.map((group) => [group.id, group.electors.length]),
  )
  const councilCapacities = apportionByWeight(councilTotal, groupWeights)

  let councilAssigned = 0
  for (const group of profile.groups) {
    const capacity = councilCapacities[group.id] ?? 0
    const localOverrides = group.electors
      .filter((elector) => own(electorAssignments, elector.id))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, capacity)
    const locallyAssigned = localOverrides.filter((elector) =>
      (electorAssignments[elector.id] ?? []).some((listId) => validListIds.has(listId)),
    ).length
    const remaining = Math.max(0, capacity - localOverrides.length)
    const bulk = calculateBulkDistribution(
      bulkRules[group.nuance as Nuance],
      remaining,
      validListIds,
    )
    councilAssigned += locallyAssigned + bulk.assignedElectors
  }

  const extraAssigned = calculateExtraDelegateState({
    profile,
    listIds,
    bulkRules,
    electorAssignments,
    extraAssignments,
    maxVotesPerElector,
  }).assigned
  const assigned = Math.min(
    councilTotal + extraTotal,
    councilAssigned + extraAssigned,
  )

  return {
    profile,
    councilAssigned,
    councilTotal,
    extraAssigned,
    extraTotal,
    assigned,
    total: councilTotal + extraTotal,
    remaining: Math.max(0, councilTotal + extraTotal - assigned),
  }
}
