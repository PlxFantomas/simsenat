import { describe, expect, it } from 'vitest'
import type { CommuneProfile, Elector } from '../data/demo'
import {
  calculateCommuneCoverage,
  calculateExtraDelegateState,
} from './coverage'

const electors = (prefix: string, count: number, nuance: Elector['nuance']): Elector[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    role: 'Conseiller municipal',
    nuance,
  }))

const profile: CommuneProfile = {
  code: '00001',
  name: 'Commune test',
  mayorName: 'Maire test',
  mayorNuance: 'RN',
  councilElectors: 15,
  municipalDelegateCount: 3,
  extraDelegates: 0,
  delegateSelection: 'designation-unknown',
  groups: [
    { id: 'majority', name: 'Majorité', nuance: 'RN', kind: 'majority', electors: electors('rn', 10, 'RN') },
    { id: 'opposition', name: 'Opposition', nuance: 'PS', kind: 'opposition', electors: electors('ps', 5, 'PS') },
  ],
  dataQuality: 'imported',
}

describe('commune coverage', () => {
  it('uses statutory delegates rather than every visible councillor', () => {
    const coverage = calculateCommuneCoverage({
      profile,
      listIds: ['A'],
      bulkRules: { RN: { allocations: [{ listId: 'A', percentage: 100 }] } },
      electorAssignments: {},
      extraAssignments: {},
      maxVotesPerElector: 1,
    })

    expect(coverage.councilTotal).toBe(3)
    expect(coverage.councilAssigned).toBe(2)
    expect(coverage.remaining).toBe(1)
  })

  it('keeps an explicit empty local correction unassigned under a bulk rule', () => {
    const coverage = calculateCommuneCoverage({
      profile,
      listIds: ['A'],
      bulkRules: { RN: { allocations: [{ listId: 'A', percentage: 100 }] } },
      electorAssignments: { 'rn-1': [] },
      extraAssignments: {},
      maxVotesPerElector: 1,
    })

    expect(coverage.councilAssigned).toBe(1)
    expect(coverage.remaining).toBe(2)
  })

  it('counts aggregate majority marks as distinct additional delegates', () => {
    const coverage = calculateCommuneCoverage({
      profile: { ...profile, municipalDelegateCount: 0, extraDelegates: 2 },
      listIds: ['A', 'B'],
      bulkRules: {},
      electorAssignments: {},
      extraAssignments: { A: 2, B: 2 },
      maxVotesPerElector: 2,
    })

    expect(coverage.extraAssigned).toBe(2)
    expect(coverage.remaining).toBe(0)
  })

  it('applies bulk rules to the proportional nuance shares left after a local correction', () => {
    const state = calculateExtraDelegateState({
      profile: { ...profile, municipalDelegateCount: 0, extraDelegates: 4 },
      listIds: ['A', 'B', 'C'],
      bulkRules: {
        RN: { allocations: [{ listId: 'A', percentage: 100 }] },
        PS: { allocations: [{ listId: 'B', percentage: 100 }] },
      },
      electorAssignments: {},
      extraAssignments: { C: 1 },
      maxVotesPerElector: 1,
    })

    expect(state.poolByNuance).toEqual({ RN: 3, PS: 1 })
    expect(state.manuallyAssigned).toBe(1)
    expect(state.bulkVotesByList).toEqual({ A: 2, B: 1, C: 0 })
    expect(state.assigned).toBe(4)
  })
})
