import { describe, expect, it } from 'vitest'

import type { BulkRule, DepartmentScenario, SimulationList } from './demo'
import {
  announcedListsFor,
  mergeAnnouncedListsIntoScenario,
} from './announcedLists'

const workingList = (
  id: string,
  options: {
    custom?: boolean
    status?: SimulationList['status']
    nuance?: SimulationList['nuance']
  } = {},
): SimulationList => ({
  id,
  name: `Liste ${id}`,
  shortName: id,
  nuance: options.nuance ?? 'LR',
  head: 'Personne exemple',
  status: options.status ?? 'working',
  custom: options.custom,
  members: [
    {
      id: `${id}-1`,
      name: 'Personne exemple',
      nuance: options.nuance ?? 'LR',
      position: 1,
    },
  ],
})

const scenario = (lists: SimulationList[]): DepartmentScenario => ({
  lists,
  bulkRules: {},
  electorAssignments: {},
  electorNuances: {},
  extraAssignments: {},
  extraNuances: {},
  extraDelegateCounts: {},
})

describe('catalogue des annonces sénatoriales', () => {
  it('expose les annonces des Alpes-Maritimes et des Bouches-du-Rhône', () => {
    const alpesMaritimes = announcedListsFor('06', 'proportional')
    expect(alpesMaritimes).toHaveLength(6)
    expect(alpesMaritimes.every((list) => list.name.startsWith('Liste '))).toBe(true)
    const bouchesDuRhone = announcedListsFor('13', 'proportional')
    expect(bouchesDuRhone).toHaveLength(10)
    expect(new Set(bouchesDuRhone.map((list) => list.shortName)).size).toBe(10)
    expect(bouchesDuRhone.every((list) => !list.politicalLabel?.startsWith('Liste conduite'))).toBe(true)
    expect(announcedListsFor('13', 'majority')).toEqual([])
  })

  it('injecte les annonces dans un ancien scénario vide', () => {
    const migrated = mergeAnnouncedListsIntoScenario(
      scenario([]),
      '13',
      'proportional',
    )

    expect(migrated.lists).toHaveLength(10)
    expect(migrated.lists.map((list) => list.head)).toContain('Valérie Boyer')
    expect(migrated.lists.every((list) => list.status === 'announced')).toBe(true)
  })

  it('préserve les listes personnalisées et utilisées, mais retire les seeds inutilisés', () => {
    const unusedSeed = workingList('13-seed-unused')
    const assignedSeed = workingList('13-seed-assigned')
    const custom = workingList('custom-13', { custom: true })
    const previousAnnouncement = workingList('old-announcement', { status: 'announced' })
    const stored = scenario([unusedSeed, assignedSeed, custom, previousAnnouncement])
    stored.bulkRules.LR = { allocations: [{ listId: assignedSeed.id, percentage: 45 }] }
    stored.electorAssignments['elector-1'] = [custom.id]
    stored.extraAssignments['13001'] = { [previousAnnouncement.id]: 2 }

    const migrated = mergeAnnouncedListsIntoScenario(stored, '13', 'proportional')
    const ids = migrated.lists.map((list) => list.id)

    expect(ids).not.toContain(unusedSeed.id)
    expect(ids).toContain(assignedSeed.id)
    expect(ids).toContain(custom.id)
    expect(ids).toContain(previousAnnouncement.id)
    expect(migrated.bulkRules).toEqual(stored.bulkRules)
    expect(migrated.electorAssignments).toEqual(stored.electorAssignments)
    expect(migrated.extraAssignments).toEqual(stored.extraAssignments)
    expect(mergeAnnouncedListsIntoScenario(migrated, '13', 'proportional')).toBe(migrated)
  })

  it('retire toujours les listes de démonstration et ne transfère que les nuances non ambiguës', () => {
    const demoRn = workingList('13-rassemblement', { nuance: 'RN' })
    const demoLr = workingList('13-ancrage', { nuance: 'LR' })
    const stored = scenario([demoRn, demoLr])
    stored.bulkRules.RN = { listId: demoRn.id, percentage: 60 } as unknown as BulkRule
    stored.bulkRules.LR = { listId: demoLr.id, percentage: 35 } as unknown as BulkRule
    stored.electorAssignments['elector-1'] = [demoRn.id, demoLr.id]
    stored.extraAssignments['13001'] = { [demoRn.id]: 3, [demoLr.id]: 0 }

    const migrated = mergeAnnouncedListsIntoScenario(stored, '13', 'proportional')
    const rnList = migrated.lists.find((list) => list.nuance === 'RN')

    expect(migrated.lists.some((list) => list.id === demoRn.id || list.id === demoLr.id)).toBe(false)
    expect(migrated.bulkRules.RN?.allocations).toEqual([
      { listId: rnList?.id, percentage: 60 },
    ])
    expect(migrated.bulkRules.LR).toBeUndefined()
    expect(migrated.electorAssignments['elector-1']).toEqual([rnList?.id])
    expect(migrated.extraAssignments['13001']).toEqual({ [rnList?.id ?? 'missing']: 3 })
  })
})
