import { describe, expect, it } from 'vitest'
import type { CommuneProfile, Elector, MunicipalGroup } from '../data/demo'
import type { Nuance } from '../data/election2026'
import {
  allocateExtraDelegatesByNuance,
  apportionByWeight,
} from './apportionment'

const electors = (prefix: string, count: number, nuance: Nuance): Elector[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    name: `${prefix} ${index + 1}`,
    role: 'Conseiller municipal',
    nuance,
  }))

const group = (
  id: string,
  nuance: Nuance,
  count: number,
  kind: MunicipalGroup['kind'] = 'opposition',
): MunicipalGroup => ({
  id,
  name: id,
  nuance,
  kind,
  electors: electors(id, count, nuance),
})

const profile = (
  groups: MunicipalGroup[],
  extraDelegates: number,
  mayorNuance: Nuance = groups[0]?.nuance ?? 'Divers/SE',
): CommuneProfile => ({
  code: '00001',
  name: 'Commune test',
  mayorName: 'Maire test',
  mayorNuance,
  councilElectors: groups.reduce((sum, item) => sum + item.electors.length, 0),
  extraDelegates,
  groups,
  dataQuality: 'imported',
})

describe('apportionByWeight', () => {
  it('allocates a 75/25 balance exactly', () => {
    expect(apportionByWeight(4, { majority: 3, opposition: 1 })).toEqual({
      majority: 3,
      opposition: 1,
    })
  })

  it('always conserves the requested integer total', () => {
    for (const total of [0, 1, 2, 7, 43, 100]) {
      const allocation = apportionByWeight(total, { A: 11, B: 7, C: 3 })
      expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(total)
      expect(Object.values(allocation).every(Number.isSafeInteger)).toBe(true)
      expect(Object.values(allocation).every((value) => value >= 0)).toBe(true)
    }
  })
})

describe('allocateExtraDelegatesByNuance', () => {
  const montluconGroups = [
    group('majority-dvd', 'DVD', 29, 'majority'),
    group('opposition-ps', 'PS', 5),
    group('opposition-dvd', 'DVD', 4),
  ]

  it('combines groups of the same nuance before rounding', () => {
    expect(allocateExtraDelegatesByNuance(profile(montluconGroups, 3))).toEqual({
      DVD: 3,
      PS: 0,
    })
  })

  it('does not depend on the order of municipal groups', () => {
    const forward = allocateExtraDelegatesByNuance(profile(montluconGroups, 3))
    const reversed = allocateExtraDelegatesByNuance(
      profile([...montluconGroups].reverse(), 3),
    )

    expect(reversed).toEqual(forward)
  })

  it('allocates no delegates when the commune has none', () => {
    const allocation = allocateExtraDelegatesByNuance(
      profile([group('majority', 'RN', 30, 'majority')], 0),
    )

    expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(0)
  })

  it('falls back entirely to the mayor nuance when no group has weight', () => {
    expect(
      allocateExtraDelegatesByNuance(
        profile([group('empty', 'RN', 0, 'majority')], 5, 'PS'),
      ),
    ).toEqual({ PS: 5 })
  })
})
