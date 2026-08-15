import { NUANCES, type Nuance } from './election2026'
import type { CommuneProfile, Elector, MunicipalGroup } from './demo'

export const MUNICIPAL_DATA_SCHEMA_VERSION = 1 as const

export type MunicipalDataQuality =
  | 'official'
  | 'provisional'
  | 'derived'
  | 'mixed'

export interface MunicipalDataSource {
  readonly label: string
  readonly url?: string
  readonly asOf?: string
  readonly quality: MunicipalDataQuality
}

export interface MunicipalDepartmentShardV1 {
  readonly schemaVersion: typeof MUNICIPAL_DATA_SCHEMA_VERSION
  readonly departmentCode: string
  readonly datasetRevision: string
  readonly sources: readonly MunicipalDataSource[]
  readonly electorateByNuance?: Readonly<Partial<Record<Nuance, number>>>
  readonly stats?: Readonly<Record<string, number | null>>
  readonly communes: readonly CommuneProfile[]
}

interface MunicipalDataBase {
  readonly departmentCode: string
  readonly requestUrl: string
  readonly communes: readonly CommuneProfile[]
  readonly communesByCode: ReadonlyMap<string, CommuneProfile>
  readonly electorateByNuance: Readonly<Partial<Record<Nuance, number>>>
  readonly stats: Readonly<Record<string, number | null>> | null
}

export interface MunicipalSourceData extends MunicipalDataBase {
  readonly mode: 'source'
  readonly datasetRevision: string
  readonly sources: readonly MunicipalDataSource[]
  readonly fallback: null
}

export type MunicipalFallbackReason =
  | 'invalid-department-code'
  | 'not-found'
  | 'http-error'
  | 'network-error'
  | 'aborted'
  | 'invalid-json'
  | 'invalid-data'

export interface MunicipalFallbackState {
  readonly reason: MunicipalFallbackReason
  readonly message: string
  readonly httpStatus?: number
}

export interface MunicipalFallbackData extends MunicipalDataBase {
  readonly mode: 'fallback'
  readonly datasetRevision: null
  readonly sources: readonly []
  readonly fallback: MunicipalFallbackState
}

export type MunicipalDepartmentData = MunicipalSourceData | MunicipalFallbackData

export type MunicipalFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface LoadMunicipalDataOptions {
  /** Cancels only this consumer; it never aborts the shared cached request. */
  readonly signal?: AbortSignal
  readonly fetcher?: MunicipalFetch
  /** Ignores an existing cached result and starts a fresh request. */
  readonly forceReload?: boolean
}

const nuances = new Set<string>(NUANCES)
const qualities = new Set<MunicipalDataQuality>([
  'official',
  'provisional',
  'derived',
  'mixed',
])
const groupKinds = new Set<MunicipalGroup['kind']>([
  'majority',
  'opposition',
  'unregistered',
])
const dataQualities = new Set<CommuneProfile['dataQuality']>(['demo', 'imported'])
const cache = new Map<string, Promise<MunicipalDepartmentData>>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isOptionalString = (value: unknown) =>
  value === undefined || typeof value === 'string'

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new TypeError(message)
}

const validateElector = (value: unknown, path: string): Elector => {
  assert(isRecord(value), `${path} doit être un objet.`)
  assert(isNonEmptyString(value.id), `${path}.id est requis.`)
  assert(isNonEmptyString(value.name), `${path}.name est requis.`)
  assert(isNonEmptyString(value.role), `${path}.role est requis.`)
  assert(
    isNonEmptyString(value.nuance) && nuances.has(value.nuance),
    `${path}.nuance est inconnue.`,
  )
  assert(
    value.isMayor === undefined || typeof value.isMayor === 'boolean',
    `${path}.isMayor doit être booléen.`,
  )
  return value as unknown as Elector
}

const validateGroup = (value: unknown, path: string): MunicipalGroup => {
  assert(isRecord(value), `${path} doit être un objet.`)
  assert(isNonEmptyString(value.id), `${path}.id est requis.`)
  assert(isNonEmptyString(value.name), `${path}.name est requis.`)
  assert(
    isNonEmptyString(value.nuance) && nuances.has(value.nuance),
    `${path}.nuance est inconnue.`,
  )
  assert(
    typeof value.kind === 'string' && groupKinds.has(value.kind as MunicipalGroup['kind']),
    `${path}.kind est inconnu.`,
  )
  assert(Array.isArray(value.electors), `${path}.electors doit être un tableau.`)
  value.electors.forEach((elector, index) => validateElector(elector, `${path}.electors[${index}]`))
  return value as unknown as MunicipalGroup
}

const validateCommune = (value: unknown, path: string): CommuneProfile => {
  assert(isRecord(value), `${path} doit être un objet.`)
  assert(isNonEmptyString(value.code), `${path}.code est requis.`)
  assert(isNonEmptyString(value.name), `${path}.name est requis.`)
  assert(isNonEmptyString(value.mayorName), `${path}.mayorName est requis.`)
  assert(
    isNonEmptyString(value.mayorNuance) && nuances.has(value.mayorNuance),
    `${path}.mayorNuance est inconnue.`,
  )
  assert(isCount(value.councilElectors), `${path}.councilElectors est invalide.`)
  assert(isCount(value.extraDelegates), `${path}.extraDelegates est invalide.`)
  assert(Array.isArray(value.groups), `${path}.groups doit être un tableau.`)
  assert(
    typeof value.dataQuality === 'string' &&
      dataQualities.has(value.dataQuality as CommuneProfile['dataQuality']),
    `${path}.dataQuality est inconnue.`,
  )

  const groupIds = new Set<string>()
  const electorIds = new Set<string>()
  let councilElectors = 0
  value.groups.forEach((rawGroup, groupIndex) => {
    const group = validateGroup(rawGroup, `${path}.groups[${groupIndex}]`)
    assert(!groupIds.has(group.id), `${path} contient le groupe dupliqué ${group.id}.`)
    groupIds.add(group.id)
    councilElectors += group.electors.length
    for (const elector of group.electors) {
      assert(!electorIds.has(elector.id), `${path} contient l'électeur dupliqué ${elector.id}.`)
      electorIds.add(elector.id)
    }
  })
  assert(
    councilElectors === value.councilElectors,
    `${path}.councilElectors ne correspond pas aux électeurs des groupes.`,
  )
  return value as unknown as CommuneProfile
}

const validateSource = (value: unknown, path: string): MunicipalDataSource => {
  assert(isRecord(value), `${path} doit être un objet.`)
  assert(isNonEmptyString(value.label), `${path}.label est requis.`)
  assert(isOptionalString(value.url), `${path}.url doit être une chaîne.`)
  assert(isOptionalString(value.asOf), `${path}.asOf doit être une chaîne.`)
  assert(
    typeof value.quality === 'string' && qualities.has(value.quality as MunicipalDataQuality),
    `${path}.quality est inconnue.`,
  )
  return value as unknown as MunicipalDataSource
}

/** Parses and lightly validates the versioned JSON contract. */
export const parseMunicipalDepartmentShard = (
  value: unknown,
  expectedDepartmentCode: string,
): MunicipalDepartmentShardV1 => {
  assert(isRecord(value), 'Le shard municipal doit être un objet.')
  assert(
    value.schemaVersion === MUNICIPAL_DATA_SCHEMA_VERSION,
    `Version de shard municipal non prise en charge : ${String(value.schemaVersion)}.`,
  )
  assert(
    value.departmentCode === expectedDepartmentCode,
    `Le shard ${String(value.departmentCode)} ne correspond pas au département ${expectedDepartmentCode}.`,
  )
  assert(isNonEmptyString(value.datasetRevision), 'datasetRevision est requis.')
  assert(Array.isArray(value.sources) && value.sources.length > 0, 'sources doit être renseigné.')
  assert(Array.isArray(value.communes), 'communes doit être un tableau.')

  const sources = value.sources.map((source, index) =>
    validateSource(source, `sources[${index}]`),
  )
  const communeCodes = new Set<string>()
  const globalElectorIds = new Set<string>()
  const communes = value.communes.map((commune, index) => {
    const parsed = validateCommune(commune, `communes[${index}]`)
    assert(!communeCodes.has(parsed.code), `Code commune dupliqué : ${parsed.code}.`)
    communeCodes.add(parsed.code)
    for (const elector of parsed.groups.flatMap((group) => group.electors)) {
      assert(
        !globalElectorIds.has(elector.id),
        `Identifiant électeur dupliqué dans le département : ${elector.id}.`,
      )
      globalElectorIds.add(elector.id)
    }
    return parsed
  })
  const electorateByNuance: Partial<Record<Nuance, number>> = {}
  if (isRecord(value.electorateByNuance)) {
    Object.entries(value.electorateByNuance).forEach(([nuance, count]) => {
      assert(nuances.has(nuance), `Nuance départementale inconnue : ${nuance}.`)
      assert(isCount(count), `Effectif départemental invalide pour ${nuance}.`)
      electorateByNuance[nuance as Nuance] = count
    })
  }
  const stats: Record<string, number | null> = {}
  if (isRecord(value.stats)) {
    Object.entries(value.stats).forEach(([name, item]) => {
      if (item === null || (typeof item === 'number' && Number.isFinite(item))) {
        stats[name] = item
      }
    })
  }

  return {
    schemaVersion: MUNICIPAL_DATA_SCHEMA_VERSION,
    departmentCode: expectedDepartmentCode,
    datasetRevision: value.datasetRevision,
    sources,
    electorateByNuance,
    stats: Object.keys(stats).length > 0 ? stats : undefined,
    communes,
  }
}

export const municipalDataUrl = (departmentCode: string) =>
  `/data/election-2026/departments/${departmentCode}.json`

const fallbackResult = (
  departmentCode: string,
  requestUrl: string,
  fallback: MunicipalFallbackState,
): MunicipalFallbackData => ({
  mode: 'fallback',
  departmentCode,
  requestUrl,
  datasetRevision: null,
  sources: [],
  communes: [],
  communesByCode: new Map(),
  electorateByNuance: {},
  stats: null,
  fallback,
})

const loadUncached = async (
  departmentCode: string,
  requestUrl: string,
  fetcher: MunicipalFetch | undefined,
): Promise<MunicipalDepartmentData> => {
  const request = fetcher ?? globalThis.fetch
  if (typeof request !== 'function') {
    return fallbackResult(departmentCode, requestUrl, {
      reason: 'network-error',
      message: 'Aucune fonction de chargement réseau n’est disponible.',
    })
  }

  let response: Response
  try {
    response = await request(requestUrl)
  } catch (error) {
    const aborted =
      (error instanceof DOMException && error.name === 'AbortError')
    return fallbackResult(departmentCode, requestUrl, {
      reason: aborted ? 'aborted' : 'network-error',
      message: aborted
        ? 'Le chargement des données municipales a été annulé.'
        : `Impossible de charger les données municipales : ${error instanceof Error ? error.message : String(error)}.`,
    })
  }

  if (!response.ok) {
    return fallbackResult(departmentCode, requestUrl, {
      reason: response.status === 404 ? 'not-found' : 'http-error',
      message:
        response.status === 404
          ? `Aucun shard municipal n’est disponible pour le département ${departmentCode}.`
          : `Le chargement municipal a échoué avec le statut HTTP ${response.status}.`,
      httpStatus: response.status,
    })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    return fallbackResult(departmentCode, requestUrl, {
      reason: 'invalid-json',
      message: `Le shard municipal n’est pas un JSON valide : ${error instanceof Error ? error.message : String(error)}.`,
    })
  }

  let shard: MunicipalDepartmentShardV1
  try {
    shard = parseMunicipalDepartmentShard(payload, departmentCode)
  } catch (error) {
    return fallbackResult(departmentCode, requestUrl, {
      reason: 'invalid-data',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    mode: 'source',
    departmentCode,
    requestUrl,
    datasetRevision: shard.datasetRevision,
    sources: shard.sources,
    communes: shard.communes,
    communesByCode: new Map(shard.communes.map((commune) => [commune.code, commune])),
    electorateByNuance: shard.electorateByNuance ?? {},
    stats: shard.stats ?? null,
    fallback: null,
  }
}

const consumerAbortResult = (departmentCode: string, requestUrl: string) =>
  fallbackResult(departmentCode, requestUrl, {
    reason: 'aborted',
    message: 'Le chargement des données municipales a été annulé.',
  })

/**
 * Gives one consumer an abortable view of a shared request. Aborting this
 * wrapper never aborts or replaces the promise stored in the module cache.
 */
const withConsumerAbort = (
  sharedRequest: Promise<MunicipalDepartmentData>,
  signal: AbortSignal | undefined,
  departmentCode: string,
  requestUrl: string,
): Promise<MunicipalDepartmentData> => {
  if (!signal) return sharedRequest
  if (signal.aborted) {
    return Promise.resolve(consumerAbortResult(departmentCode, requestUrl))
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: MunicipalDepartmentData) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abortConsumer)
      resolve(result)
    }
    const abortConsumer = () => finish(consumerAbortResult(departmentCode, requestUrl))

    signal.addEventListener('abort', abortConsumer, { once: true })
    void sharedRequest.then(finish)
  })
}

/**
 * Loads one department on demand. Results and in-flight requests are cached by
 * normalized department code; use `forceReload` for an explicit retry.
 */
export const loadMunicipalData = (
  rawDepartmentCode: string,
  options: LoadMunicipalDataOptions = {},
): Promise<MunicipalDepartmentData> => {
  const departmentCode = rawDepartmentCode.trim().toUpperCase()
  const requestUrl = municipalDataUrl(departmentCode)
  if (!/^(?:\d{2,3}|2A|2B)$/.test(departmentCode)) {
    return Promise.resolve(
      fallbackResult(departmentCode, requestUrl, {
        reason: 'invalid-department-code',
        message: `Code département invalide : ${rawDepartmentCode}.`,
      }),
    )
  }

  if (options.signal?.aborted) {
    return Promise.resolve(consumerAbortResult(departmentCode, requestUrl))
  }

  if (options.forceReload) cache.delete(departmentCode)
  let sharedRequest = cache.get(departmentCode)
  if (!sharedRequest) {
    sharedRequest = loadUncached(departmentCode, requestUrl, options.fetcher)
    cache.set(departmentCode, sharedRequest)
    void sharedRequest.then((result) => {
      if (
        cache.get(departmentCode) === sharedRequest &&
        (result.fallback?.reason === 'aborted' || result.fallback?.reason === 'network-error')
      ) {
        cache.delete(departmentCode)
      }
    })
  }
  return withConsumerAbort(
    sharedRequest,
    options.signal,
    departmentCode,
    requestUrl,
  )
}

/** Primarily useful for an explicit retry and isolated tests. */
export const clearMunicipalDataCache = (departmentCode?: string) => {
  if (departmentCode === undefined) {
    cache.clear()
    return
  }
  cache.delete(departmentCode.trim().toUpperCase())
}
