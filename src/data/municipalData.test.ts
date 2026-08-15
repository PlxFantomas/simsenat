import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearMunicipalDataCache,
  loadMunicipalData,
  municipalDataUrl,
  parseMunicipalDepartmentShard,
  type MunicipalDepartmentShardV1,
  type MunicipalFetch,
} from './municipalData'

const validShard = (): MunicipalDepartmentShardV1 => ({
  schemaVersion: 1,
  departmentCode: '01',
  datasetRevision: '2026-08-15',
  sources: [
    {
      label: 'Préfecture de l’Ain',
      url: 'https://example.test/ain',
      asOf: '2026-08-15',
      quality: 'derived',
    },
  ],
  communes: [
    {
      code: '01001',
      name: "L'Abergement-Clémenciat",
      mayorName: 'Camille Exemple',
      mayorNuance: 'DVD',
      councilElectors: 1,
      extraDelegates: 0,
      dataQuality: 'imported',
      groups: [
        {
          id: 'majority',
          name: 'Majorité municipale',
          nuance: 'DVD',
          kind: 'majority',
          electors: [
            {
              id: 'rne-01001-1',
              name: 'Camille Exemple',
              role: 'Maire · grand électeur',
              nuance: 'DVD',
              isMayor: true,
            },
          ],
        },
      ],
    },
  ],
})

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => clearMunicipalDataCache())

describe('municipal data loader', () => {
  it('loads the requested shard, indexes communes, and reuses the cache', async () => {
    const fetcher = vi.fn(async () => jsonResponse(validShard())) as unknown as MunicipalFetch

    const first = await loadMunicipalData('01', { fetcher })
    const second = await loadMunicipalData('01', { fetcher })

    expect(first.mode).toBe('source')
    expect(first.datasetRevision).toBe('2026-08-15')
    expect(first.communesByCode.get('01001')?.mayorName).toBe('Camille Exemple')
    expect(second).toBe(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(municipalDataUrl('01'))
  })

  it('does not let one aborted consumer poison a shared in-flight request', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    ) as unknown as MunicipalFetch
    const firstController = new AbortController()
    const firstRequest = loadMunicipalData('01', {
      fetcher,
      signal: firstController.signal,
    })

    firstController.abort()
    const secondController = new AbortController()
    const secondRequest = loadMunicipalData('01', {
      fetcher,
      signal: secondController.signal,
    })
    resolveFetch?.(jsonResponse(validShard()))

    const first = await firstRequest
    const second = await secondRequest
    const cached = await loadMunicipalData('01', { fetcher })

    expect(first.fallback?.reason).toBe('aborted')
    expect(second.mode).toBe('source')
    expect(cached).toBe(second)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('returns an explicit fallback for a missing department shard', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 404)) as unknown as MunicipalFetch

    const result = await loadMunicipalData('03', { fetcher })

    expect(result).toMatchObject({
      mode: 'fallback',
      departmentCode: '03',
      datasetRevision: null,
      fallback: { reason: 'not-found', httpStatus: 404 },
    })
    expect(result.communes).toEqual([])
    expect(result.communesByCode.size).toBe(0)
  })

  it('rejects a shard whose department code does not match the request', async () => {
    const fetcher = vi.fn(async () => jsonResponse(validShard())) as unknown as MunicipalFetch

    const result = await loadMunicipalData('02', { fetcher })

    expect(result.mode).toBe('fallback')
    expect(result.fallback?.reason).toBe('invalid-data')
    expect(result.fallback?.message).toContain('ne correspond pas au département 02')
  })

  it('rejects duplicate commune and elector identifiers at runtime', () => {
    const duplicateCommune = validShard()
    expect(() =>
      parseMunicipalDepartmentShard(
        { ...duplicateCommune, communes: [...duplicateCommune.communes, duplicateCommune.communes[0]] },
        '01',
      ),
    ).toThrow(/Code commune dupliqué/)

    const base = validShard()
    const otherCommune = {
      ...base.communes[0],
      code: '01002',
      name: 'Commune voisine',
    }
    expect(() =>
      parseMunicipalDepartmentShard(
        { ...base, communes: [...base.communes, otherCommune] },
        '01',
      ),
    ).toThrow(/Identifiant électeur dupliqué dans le département/)
  })

  it('makes malformed JSON, network failures, and invalid codes explicit', async () => {
    const invalidJsonFetcher = vi.fn(async () =>
      new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as unknown as MunicipalFetch
    const invalidJson = await loadMunicipalData('01', { fetcher: invalidJsonFetcher })
    expect(invalidJson.fallback?.reason).toBe('invalid-json')

    const networkFetcher = vi.fn(async () => {
      throw new Error('hors ligne')
    }) as unknown as MunicipalFetch
    const network = await loadMunicipalData('02', { fetcher: networkFetcher })
    expect(network.fallback?.reason).toBe('network-error')

    const invalidCodeFetcher = vi.fn() as unknown as MunicipalFetch
    const invalidCode = await loadMunicipalData('../01', { fetcher: invalidCodeFetcher })
    expect(invalidCode.fallback?.reason).toBe('invalid-department-code')
    expect(invalidCodeFetcher).not.toHaveBeenCalled()
  })

  it('supports an explicit forced reload of a cached result', async () => {
    const fetcher = vi.fn(async () => jsonResponse(validShard())) as unknown as MunicipalFetch

    await loadMunicipalData('01', { fetcher })
    await loadMunicipalData('01', { fetcher, forceReload: true })

    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
