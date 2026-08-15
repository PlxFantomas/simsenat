import { describe, expect, it } from 'vitest'
import { DEPARTMENTS_2026, votingMethodFor } from './election2026'
import { demoElectorateByNuance } from './demo'

describe('official 2026 election dataset', () => {
  it('contains the 63 territorial constituencies of series 2', () => {
    expect(DEPARTMENTS_2026).toHaveLength(63)
    expect(new Set(DEPARTMENTS_2026.map(({ code }) => code)).size).toBe(63)
  })

  it('accounts for 172 territorial seats plus 6 French-abroad seats', () => {
    const territorialSeats = DEPARTMENTS_2026.reduce((sum, { seats }) => sum + seats, 0)
    expect(territorialSeats).toBe(172)
    expect(territorialSeats + 6).toBe(178)
  })

  it('matches the official electoral-college control totals', () => {
    const municipalDelegates = DEPARTMENTS_2026.reduce(
      (sum, department) => sum + (department.municipalDelegates ?? 0),
      0,
    )
    const totalElectors = DEPARTMENTS_2026.reduce(
      (sum, department) => sum + (department.officialElectors ?? 0),
      0,
    )
    expect(municipalDelegates).toBe(88_860)
    expect(totalElectors).toBe(92_936)
    expect(totalElectors + 533).toBe(93_469)
  })

  it('uses proportional representation from three seats onward', () => {
    expect(votingMethodFor(1)).toBe('majority')
    expect(votingMethodFor(2)).toBe('majority')
    expect(votingMethodFor(3)).toBe('proportional')
    expect(DEPARTMENTS_2026.filter(({ seats }) => seats >= 3)).toHaveLength(29)
  })

  it('keeps every demo nuance distribution equal to the official college total', () => {
    for (const department of DEPARTMENTS_2026) {
      const distribution = demoElectorateByNuance(
        department.code,
        department.officialElectors ?? 0,
      )
      const distributed = Object.values(distribution).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      )
      expect(distributed, department.code).toBe(department.officialElectors)
    }
  })
})
