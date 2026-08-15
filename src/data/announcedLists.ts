import catalogue from './announced-lists-2026.json'
import { NUANCES, type Nuance, type VotingMethod } from './election2026'
import type { DepartmentScenario, SimulationList } from './demo'
import { bulkAllocationsFor, normalizeBulkRule } from '../domain/scenario'

interface CatalogueDepartment {
  readonly method: VotingMethod
  readonly lists: readonly SimulationList[]
  readonly sourceUrl: string
  readonly sourceAsOf: string
  readonly sourceRevision?: number | null
}

interface Catalogue {
  readonly schemaVersion: number
  readonly retrievedAt: string
  readonly provider: string
  readonly warning: string
  readonly departments: Readonly<Record<string, CatalogueDepartment>>
}

const data = catalogue as unknown as Catalogue
const validNuances = new Set<string>(NUANCES)
const DEMO_LIST_NUANCES = new Map<string, Nuance>([
  ['ancrage', 'LR'],
  ['rassemblement', 'RN'],
  ['ensemble', 'Renaissance'],
  ['solidaires', 'PS'],
  ['ecologie', 'Ecologistes'],
  ['libres', 'Divers/SE'],
])

const normalizeProvisionalListName = (value: string) => {
  const match = value.match(/^(menée|mené|conduite|conduit)\s+par\s+(.+)$/i)
  if (!match) return value
  const verb = match[1].toLocaleLowerCase('fr').startsWith('men') ? 'menée' : 'conduite'
  return `Liste ${verb} par ${match[2]}`
}

const politicalLabelFor = (list: SimulationList) => {
  const raw = list.politicalLabel?.trim()
  if (raw && !/^(?:liste\s+)?(?:menée|mené|conduite|conduit)\s+par\b/i.test(raw)) {
    return raw
  }
  const memberLabels = Array.from(
    new Set(
      list.members
        .map((member) => member.politicalLabel?.trim())
        .filter((label): label is string => Boolean(label)),
    ),
  )
  return memberLabels.length > 0 ? memberLabels.join(' – ') : list.nuance
}

const copyList = (list: SimulationList): SimulationList => ({
  ...list,
  name: normalizeProvisionalListName(list.name),
  shortName: normalizeProvisionalListName(list.shortName),
  politicalLabel: politicalLabelFor(list),
  members: list.members.map((member) => ({ ...member })),
})

export const announcedListsFor = (
  departmentCode: string,
  method: VotingMethod,
): SimulationList[] => {
  const department = data.departments[departmentCode]
  if (!department || department.method !== method) return []
  const lists = department.lists
    .filter(
      (list) =>
        list.status === 'announced' &&
        validNuances.has(list.nuance) &&
        list.members.length > 0,
    )
    .map(copyList)
  const shortNameCounts = new Map<string, number>()
  lists.forEach((list) => {
    shortNameCounts.set(list.shortName, (shortNameCounts.get(list.shortName) ?? 0) + 1)
  })
  return lists.map((list) =>
    (shortNameCounts.get(list.shortName) ?? 0) > 1
      ? { ...list, shortName: list.head }
      : list,
  )
}

export const ANNOUNCED_LISTS_META = {
  provider: data.provider,
  retrievedAt: data.retrievedAt,
  warning: data.warning,
}

const referencedListIds = (scenario: DepartmentScenario) => {
  const ids = new Set<string>()
  Object.values(scenario.bulkRules ?? {}).forEach((rule) => {
    bulkAllocationsFor(rule).forEach(({ listId }) => ids.add(listId))
  })
  Object.values(scenario.electorAssignments ?? {}).forEach((assignments) => {
    assignments.forEach((listId) => ids.add(listId))
  })
  Object.values(scenario.extraAssignments ?? {}).forEach((assignments) => {
    Object.entries(assignments).forEach(([listId, count]) => {
      if (count > 0) ids.add(listId)
    })
  })
  return ids
}

const normalizeScenarioBulkRules = (
  scenario: DepartmentScenario,
): DepartmentScenario => {
  let changed = false
  const bulkRules: DepartmentScenario['bulkRules'] = {}
  Object.entries(scenario.bulkRules ?? {}).forEach(([nuance, rule]) => {
    if (!rule) return
    const normalized = normalizeBulkRule(rule)
    bulkRules[nuance as Nuance] = normalized
    if (!Array.isArray((rule as { allocations?: unknown }).allocations)) changed = true
  })
  return changed ? { ...scenario, bulkRules } : scenario
}

const rewriteDemoAssignments = (
  scenario: DepartmentScenario,
  departmentCode: string,
  announced: readonly SimulationList[],
): DepartmentScenario => {
  const demoNuancesById = new Map(
    Array.from(DEMO_LIST_NUANCES, ([slug, nuance]) => [
      `${departmentCode}-${slug}`,
      nuance,
    ]),
  )
  const replacementById = new Map<string, string>()
  demoNuancesById.forEach((nuance, demoId) => {
    const candidates = announced.filter((list) => list.nuance === nuance)
    if (candidates.length === 1) replacementById.set(demoId, candidates[0].id)
  })

  const bulkRules: DepartmentScenario['bulkRules'] = {}
  Object.entries(scenario.bulkRules ?? {}).forEach(([nuance, rule]) => {
    if (!rule) return
    const rewritten = bulkAllocationsFor(rule).flatMap((allocation) => {
      if (!demoNuancesById.has(allocation.listId)) return [allocation]
      const replacement = replacementById.get(allocation.listId)
      return replacement ? [{ ...allocation, listId: replacement }] : []
    })
    if (rewritten.length > 0) {
      bulkRules[nuance as Nuance] = { allocations: rewritten }
    }
  })

  const electorAssignments: DepartmentScenario['electorAssignments'] = {}
  Object.entries(scenario.electorAssignments ?? {}).forEach(([electorId, assignments]) => {
    const rewritten = Array.from(
      new Set(
        assignments.flatMap((listId) => {
          if (!demoNuancesById.has(listId)) return [listId]
          const replacement = replacementById.get(listId)
          return replacement ? [replacement] : []
        }),
      ),
    )
    if (rewritten.length > 0) electorAssignments[electorId] = rewritten
  })

  const extraAssignments: DepartmentScenario['extraAssignments'] = {}
  Object.entries(scenario.extraAssignments ?? {}).forEach(([communeCode, assignments]) => {
    const rewritten: Record<string, number> = {}
    Object.entries(assignments).forEach(([listId, count]) => {
      if (!demoNuancesById.has(listId)) {
        rewritten[listId] = count
        return
      }
      const replacement = replacementById.get(listId)
      if (replacement && count > 0) {
        rewritten[replacement] = (rewritten[replacement] ?? 0) + count
      }
    })
    if (Object.keys(rewritten).length > 0) extraAssignments[communeCode] = rewritten
  })

  return {
    ...scenario,
    bulkRules,
    electorAssignments,
    extraAssignments,
  }
}

/**
 * Injects the current catalogue into a stored scenario without losing work.
 * Old generic seeds are discarded only when they are neither customised nor
 * referenced by an assignment. Previous announced/official lists are kept so
 * a catalogue revision cannot silently erase a user's scenario.
 */
export const mergeAnnouncedListsIntoScenario = (
  scenario: DepartmentScenario,
  departmentCode: string,
  method: VotingMethod,
): DepartmentScenario => {
  const normalizedScenario = normalizeScenarioBulkRules(scenario)
  const announced = announcedListsFor(departmentCode, method)
  if (announced.length === 0) return normalizedScenario

  const scenarioWithoutDemoAssignments = rewriteDemoAssignments(
    normalizedScenario,
    departmentCode,
    announced,
  )
  const announcedIds = new Set(announced.map((list) => list.id))
  const demoIds = new Set(
    Array.from(DEMO_LIST_NUANCES.keys(), (slug) => `${departmentCode}-${slug}`),
  )
  const referencedIds = referencedListIds(scenarioWithoutDemoAssignments)
  const storedLists = Array.isArray(scenario.lists) ? scenario.lists : []
  const preserved = storedLists.filter(
    (list) =>
      !announcedIds.has(list.id) &&
      !demoIds.has(list.id) &&
      (list.custom === true || list.status !== 'working' || referencedIds.has(list.id)),
  )
  const lists = [...announced, ...preserved]
  const nextScenario = { ...scenarioWithoutDemoAssignments, lists }

  return JSON.stringify(nextScenario) === JSON.stringify(scenario)
    ? scenario
    : nextScenario
}

export const isNuance = (value: string): value is Nuance => validNuances.has(value)
