import { describe, expect, it } from 'vitest'

import {
  calculateBulkDistribution,
  calculateScenarioTotals,
  getEffectiveElectorAssignment,
  getUniqueVoteLeader,
  type ScenarioTotalsInput,
} from './scenario'

type Nuance = 'LR' | 'PS' | 'RN'

const makeInput = (
  overrides: Partial<ScenarioTotalsInput<Nuance>> = {},
): ScenarioTotalsInput<Nuance> => ({
  listIds: ['A', 'B', 'C'],
  electorateByNuance: { LR: 10 },
  bulkRules: {},
  electorAssignments: {},
  electorNuances: {},
  extraAssignments: {},
  extraNuances: {},
  extraDelegateCounts: {},
  maxVotesPerElector: 1,
  ...overrides,
})

describe('scenario totals', () => {
  it('exposes only a unique positive leader for the national map', () => {
    expect(getUniqueVoteLeader([
      { contenderId: 'A', votes: 12 },
      { contenderId: 'B', votes: 8 },
    ])).toEqual({ contenderId: 'A', votes: 12 })
    expect(getUniqueVoteLeader([
      { contenderId: 'A', votes: 12 },
      { contenderId: 'B', votes: 12 },
    ])).toBeNull()
    expect(getUniqueVoteLeader([{ contenderId: 'A', votes: 0 }])).toBeNull()
  })

  it('applies a bulk rule from the municipal group nuance and exposes its source', () => {
    const assignment = getEffectiveElectorAssignment<Nuance>({
      electorId: 'elector-dvd-on-rn-list',
      electoralNuance: 'RN',
      bulkRules: { RN: { allocations: [{ listId: 'A', percentage: 100 }] } },
      electorAssignments: {},
      percentile: 87,
    })

    expect(assignment).toEqual({ listIds: ['A'], source: 'bulk' })
  })

  it('keeps an explicit local correction ahead of the bulk rule', () => {
    const assignment = getEffectiveElectorAssignment<Nuance>({
      electorId: 'elector',
      electoralNuance: 'RN',
      bulkRules: { RN: { allocations: [{ listId: 'A', percentage: 100 }] } },
      electorAssignments: { elector: ['B'] },
      percentile: 10,
    })

    expect(assignment).toEqual({ listIds: ['B'], source: 'local' })
  })

  it('does not count a local override twice under a 100% bulk rule', () => {
    const result = calculateScenarioTotals(
      makeInput({
        bulkRules: { LR: { allocations: [{ listId: 'A', percentage: 100 }] } },
        electorAssignments: { elector: ['B'] },
        electorNuances: { elector: 'LR' },
      }),
    )

    expect(result.votesByList).toEqual({ A: 9, B: 1, C: 0 })
    expect(result.assignedElectors).toBe(10)
    expect(result.ignoredAdjustments).toBe(0)
  })

  it('splits one nuance across several lists without counting electors twice', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { LR: 10 },
        bulkRules: {
          LR: {
            allocations: [
              { listId: 'A', percentage: 60 },
              { listId: 'B', percentage: 30 },
            ],
          },
        },
      }),
    )

    expect(result.votesByList).toEqual({ A: 6, B: 3, C: 0 })
    expect(result.assignedElectors).toBe(9)
  })

  it('reserves locally corrected extra delegates across their nuance pool before bulk rules', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { RN: 6, PS: 4 },
        bulkRules: {
          RN: { allocations: [{ listId: 'B', percentage: 100 }] },
          PS: { allocations: [{ listId: 'C', percentage: 100 }] },
        },
        extraAssignments: { commune: { A: 2 } },
        extraNuances: {},
        extraDelegateCounts: {},
        extraDelegatePools: { commune: { RN: 6, PS: 4 } },
      }),
    )

    expect(result.votesByList).toEqual({ A: 2, B: 5, C: 3 })
    expect(result.assignedElectors).toBe(10)
    expect(result.ignoredAdjustments).toBe(0)
  })

  it('does not count extra delegates twice when local corrections cover the full pool', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { RN: 6, PS: 4 },
        bulkRules: {
          RN: { allocations: [{ listId: 'B', percentage: 100 }] },
          PS: { allocations: [{ listId: 'C', percentage: 100 }] },
        },
        extraAssignments: { commune: { A: 10 } },
        extraDelegatePools: { commune: { RN: 6, PS: 4 } },
      }),
    )

    expect(result.votesByList).toEqual({ A: 10, B: 0, C: 0 })
    expect(result.assignedElectors).toBe(10)
  })

  it('uses largest remainders so a 50/50 split never duplicates one elector', () => {
    const distribution = calculateBulkDistribution(
      {
        allocations: [
          { listId: 'A', percentage: 50 },
          { listId: 'B', percentage: 50 },
        ],
      },
      1,
      new Set(['A', 'B']),
    )

    expect(distribution.votesByList).toEqual({ A: 1, B: 0 })
    expect(distribution.assignedElectors).toBe(1)
  })

  it('still reads a legacy single-list rule', () => {
    const distribution = calculateBulkDistribution(
      { listId: 'A', percentage: 45 },
      20,
      new Set(['A']),
    )

    expect(distribution.votesByList).toEqual({ A: 9 })
    expect(distribution.assignedElectors).toBe(9)
  })

  it('supports two candidate votes per elector without exceeding ballot capacity', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { LR: 3 },
        maxVotesPerElector: 2,
        extraAssignments: { commune: { A: 3, B: 3 } },
        extraNuances: { commune: 'LR' },
        extraDelegateCounts: { commune: 3 },
      }),
    )

    expect(result.votesByList).toEqual({ A: 3, B: 3, C: 0 })
    expect(result.assignedElectors).toBe(3)
    expect(Object.values(result.votesByList).reduce((sum, votes) => sum + votes, 0)).toBe(6)
  })

  it('truncates a local delegate block to the nuance capacity left by individuals', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { LR: 4 },
        maxVotesPerElector: 2,
        electorAssignments: { elector: ['C'] },
        electorNuances: { elector: 'LR' },
        extraAssignments: { commune: { A: 5, B: 5 } },
        extraNuances: { commune: 'LR' },
        extraDelegateCounts: { commune: 5 },
      }),
    )

    expect(result.votesByList).toEqual({ A: 3, B: 3, C: 1 })
    expect(result.assignedElectors).toBe(4)
    expect(result.ignoredAdjustments).toBe(1)
    expect(result.warnings[0]).toContain('tronqué')
  })

  it('enforces one mark per ballot in a proportional election', () => {
    const result = calculateScenarioTotals(
      makeInput({
        electorateByNuance: { LR: 4 },
        extraAssignments: { commune: { A: 4, B: 4 } },
        extraNuances: { commune: 'LR' },
        extraDelegateCounts: { commune: 4 },
        maxVotesPerElector: 1,
      }),
    )

    // The declared list order is the stable truncation priority.
    expect(result.votesByList).toEqual({ A: 4, B: 0, C: 0 })
    expect(result.assignedElectors).toBe(4)
    expect(result.ignoredAdjustments).toBe(1)
  })
})
