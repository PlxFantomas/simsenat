import type { Department2026, Nuance, VotingMethod } from './election2026'
import { announcedListsFor } from './announcedLists'
import type { BulkRule } from '../domain/scenario'

export type { BulkRule } from '../domain/scenario'

export interface CandidateMember {
  id: string
  name: string
  nuance: Nuance
  position: number
  politicalLabel?: string
  functions?: string
}

export interface SimulationList {
  id: string
  name: string
  shortName: string
  nuance: Nuance
  head: string
  members: CandidateMember[]
  status: 'working' | 'announced' | 'official'
  custom?: boolean
  sourceUrl?: string
  sourceLabel?: string
  sourceAsOf?: string
  sourceRevision?: number
  politicalLabel?: string
}

export interface Elector {
  id: string
  name: string
  role: string
  nuance: Nuance
  isMayor?: boolean
  politicalLabel?: string
  matchConfidence?: string
  grandElectorStatus?: 'confirmed' | 'unknown'
}

export interface MunicipalGroup {
  id: string
  name: string
  nuance: Nuance
  kind: 'majority' | 'opposition' | 'unregistered'
  electors: Elector[]
  politicalLabel?: string
}

export interface CommuneProfile {
  code: string
  name: string
  mayorName: string
  mayorNuance: Nuance
  councilElectors: number
  municipalDelegateCount?: number
  extraDelegates: number
  councilMemberCount?: number
  population?: number | null
  populationReference?: string | null
  delegateSelection?: 'all-councillors' | 'designation-unknown' | 'fallback'
  groups: MunicipalGroup[]
  dataQuality: 'demo' | 'imported'
  sourceAsOf?: string
  sourceLabel?: string
  sourceUrl?: string
  majorityBasis?: string
}

export interface DepartmentScenario {
  lists: SimulationList[]
  bulkRules: Partial<Record<Nuance, BulkRule>>
  electorAssignments: Record<string, string[]>
  electorNuances: Record<string, Nuance>
  extraAssignments: Record<string, Record<string, number>>
  extraNuances: Record<string, Nuance>
  extraDelegateCounts: Record<string, number>
  projectionSummary?: DepartmentProjectionSummary
}

export interface DepartmentProjectionSummary {
  leaderListId: string
  leaderName: string
  leaderNuance: Nuance
  votes: number
  assignedElectors: number
  electorate: number
}

const listSeeds: Array<[string, string, Nuance]> = [
  ['ancrage', 'Nos territoires d’abord', 'LR'],
  ['rassemblement', 'Rassemblement des territoires', 'RN'],
  ['ensemble', 'Ensemble pour nos communes', 'Renaissance'],
  ['solidaires', 'Territoires solidaires', 'PS'],
  ['ecologie', 'L’écologie en commun', 'Ecologistes'],
  ['libres', 'Élus locaux libres', 'Divers/SE'],
]

export const createWorkingLists = (
  department: Department2026,
  method: VotingMethod,
): SimulationList[] => {
  const announced = announcedListsFor(department.code, method)
  if (announced.length > 0) return announced

  return listSeeds.map(([slug, name, nuance]) => {
    const id = `${department.code}-${slug}`
    const memberCount = method === 'proportional' ? department.seats + 2 : 1
    const displayName = method === 'proportional' ? name : `Candidature ${nuance}`
    return {
      id,
      name: displayName,
      shortName: method === 'proportional' ? name.split(' ').slice(0, 2).join(' ') : nuance,
      nuance,
      head: 'Candidature à renseigner',
      status: 'working',
      members: Array.from({ length: memberCount }, (_, memberIndex) => ({
        id: `${id}-candidate-${memberIndex + 1}`,
        name:
          memberIndex === 0
            ? 'Tête de liste à renseigner'
            : `Candidat·e ${memberIndex + 1} à renseigner`,
        nuance,
        position: memberIndex + 1,
      })),
    }
  })
}

export const emptyScenario = (
  department: Department2026,
  method: VotingMethod,
): DepartmentScenario => ({
  lists: createWorkingLists(department, method),
  bulkRules: {},
  electorAssignments: {},
  electorNuances: {},
  extraAssignments: {},
  extraNuances: {},
  extraDelegateCounts: {},
})

const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

const majorityNuances: Nuance[] = [
  'LR',
  'DVD',
  'Renaissance',
  'DVC',
  'PS',
  'Divers/SE',
]

const oppositionNuances: Nuance[] = [
  'RN',
  'LR',
  'PS',
  'Ecologistes',
  'PCF',
  'LFI',
  'DVC',
  'Divers/SE',
]

const largeCityExtraDelegates: Record<string, number> = {
  Marseille: 1050,
  Toulouse: 595,
  Nice: 392,
  Bordeaux: 288,
  Strasbourg: 327,
  Montpellier: 344,
  Rennes: 249,
  Reims: 191,
  Toulon: 187,
  Grenoble: 157,
  Dijon: 165,
}

const makeElectors = (
  communeCode: string,
  groupId: string,
  nuance: Nuance,
  count: number,
  mayorInGroup = false,
): Elector[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${communeCode}-${groupId}-${index + 1}`,
    name:
      mayorInGroup && index === 0
        ? 'Maire — identité à renseigner'
        : `Élu·e municipal·e ${String(index + 1).padStart(2, '0')}`,
    role:
      mayorInGroup && index === 0
        ? 'Maire · grand électeur'
        : 'Conseiller·ère · grand électeur',
    nuance,
    isMayor: mayorInGroup && index === 0,
  }))

const communeCache = new Map<string, CommuneProfile>()

export const createDemoCommune = (code: string, name: string): CommuneProfile => {
  const cacheKey = `${code}\u0000${name}`
  const cached = communeCache.get(cacheKey)
  if (cached) return cached

  const hash = hashString(`${code}-${name}`)
  const majorityNuance = majorityNuances[hash % majorityNuances.length]
  const oppositionOne = oppositionNuances[(hash >>> 3) % oppositionNuances.length]
  const oppositionTwo = oppositionNuances[(hash >>> 7) % oppositionNuances.length]
  const councilElectors = 9 + (hash % 20)
  const majorityCount = Math.max(5, Math.ceil(councilElectors * 0.58))
  const remaining = councilElectors - majorityCount
  const oppositionOneCount = Math.max(1, Math.ceil(remaining * 0.62))
  const oppositionTwoCount = Math.max(1, remaining - oppositionOneCount)
  const hasUnregistered = hash % 4 === 0 && oppositionTwoCount > 1
  const groupTwoCount = hasUnregistered ? oppositionTwoCount - 1 : oppositionTwoCount
  const configuredLargeCity = Object.entries(largeCityExtraDelegates).find(([city]) =>
    name.toLocaleLowerCase('fr').startsWith(city.toLocaleLowerCase('fr')),
  )
  const extraDelegates = configuredLargeCity?.[1] ?? (hash % 41 === 0 ? 12 + (hash % 28) : 0)

  const groups: MunicipalGroup[] = [
    {
      id: 'majority',
      name: 'Majorité municipale',
      nuance: majorityNuance,
      kind: 'majority',
      electors: makeElectors(code, 'majority', majorityNuance, majorityCount, true),
    },
    {
      id: 'opposition-1',
      name: 'Groupe d’opposition A',
      nuance: oppositionOne,
      kind: 'opposition',
      electors: makeElectors(code, 'opposition-1', oppositionOne, oppositionOneCount),
    },
    {
      id: 'opposition-2',
      name: 'Groupe d’opposition B',
      nuance: oppositionTwo,
      kind: 'opposition',
      electors: makeElectors(code, 'opposition-2', oppositionTwo, groupTwoCount),
    },
  ]

  if (hasUnregistered) {
    groups.push({
      id: 'unregistered',
      name: 'Non-inscrits',
      nuance: 'Divers/SE',
      kind: 'unregistered',
      electors: makeElectors(code, 'unregistered', 'Divers/SE', 1),
    })
  }

  const profile: CommuneProfile = {
    code,
    name,
    mayorName: 'Identité à renseigner après import',
    mayorNuance: majorityNuance,
    councilElectors,
    municipalDelegateCount: councilElectors,
    extraDelegates,
    councilMemberCount: councilElectors,
    delegateSelection: 'fallback',
    groups,
    dataQuality: 'demo',
  }
  communeCache.set(cacheKey, profile)
  return profile
}

const baseShares: Array<[Nuance, number]> = [
  ['LR', 20],
  ['DVD', 16],
  ['Renaissance', 11],
  ['Horizons', 5],
  ['Modem', 4],
  ['DVC', 8],
  ['PS', 15],
  ['Ecologistes', 5],
  ['PCF', 5],
  ['LFI', 3],
  ['RN', 5],
  ['Divers/SE', 3],
]

export const demoElectorateByNuance = (
  departmentCode: string,
  totalElectors: number,
): Partial<Record<Nuance, number>> => {
  const variation = (hashString(departmentCode) % 9) - 4
  let allocated = 0
  const output: Partial<Record<Nuance, number>> = {}
  const adjustedShares = baseShares.map(([nuance, share], index) => [
    nuance,
    Math.max(
      1,
      share + (index === hashString(departmentCode) % baseShares.length ? variation : 0),
    ),
  ] as const)
  const shareTotal = adjustedShares.reduce((sum, [, share]) => sum + share, 0)

  adjustedShares.forEach(([nuance, share]) => {
    const count = Math.floor((totalElectors * share) / shareTotal)
    output[nuance] = count
    allocated += count
  })

  output['Divers/SE'] = (output['Divers/SE'] ?? 0) + (totalElectors - allocated)
  return output
}

export const stablePercentile = (id: string) => hashString(id) % 100
