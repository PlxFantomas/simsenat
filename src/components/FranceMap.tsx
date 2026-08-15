import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { LoaderCircle, MapPin, RotateCcw } from 'lucide-react'
import {
  DEPARTMENT_BY_CODE,
  DEPARTMENTS_2026,
  NUANCE_COLORS,
  RENEWED_CODES,
} from '../data/election2026'
import type { DepartmentProjectionSummary } from '../data/demo'
import { createPathBuilder, fetchGeoJSON, type GeoFeature } from '../lib/geo'

interface FranceMapProps {
  onSelect: (code: string) => void
  onUnavailable: (name: string) => void
  onResetProjection: () => void
  canResetProjection: boolean
  projections: Readonly<Record<string, DepartmentProjectionSummary | undefined>>
}

const hasKnownNuance = (projection: DepartmentProjectionSummary | undefined) =>
  Boolean(
    projection &&
    Object.prototype.hasOwnProperty.call(NUANCE_COLORS, projection.leaderNuance),
  )

export function FranceMap({
  onSelect,
  onUnavailable,
  onResetProjection,
  canResetProjection,
  projections,
}: FranceMapProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([])
  const [hovered, setHovered] = useState<GeoFeature | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [query, setQuery] = useState('')
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchListboxId = useId()

  useEffect(() => {
    const controller = new AbortController()
    fetchGeoJSON('/data/departements.geojson', controller.signal)
      .then(({ features: loaded }) => {
        setFeatures(
          loaded.filter(({ properties }) =>
            /^(?:\d{2}|2A|2B)$/.test(properties.code),
          ),
        )
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setLoadingError(error.message)
      })
    return () => controller.abort()
  }, [])

  const pathFor = useMemo(
    () => (features.length
      ? createPathBuilder(features, 720, 650, 24, { geographicAspect: true })
      : null),
    [features],
  )

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr')
    if (!normalized) return []
    return features
      .filter(({ properties }) =>
        `${properties.code} ${properties.nom}`.toLocaleLowerCase('fr').includes(normalized),
      )
      .slice(0, 6)
  }, [features, query])
  const activeSuggestion = suggestions[activeSuggestionIndex]

  const chooseDepartment = (feature: GeoFeature) => {
    const { code, nom } = feature.properties
    if (RENEWED_CODES.has(code)) onSelect(code)
    else onUnavailable(nom)
    setQuery('')
    setActiveSuggestionIndex(-1)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery('')
      setActiveSuggestionIndex(-1)
      return
    }
    if (!suggestions.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSuggestionIndex((current) =>
        current >= suggestions.length - 1 ? 0 : current + 1,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSuggestionIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      )
    } else if (event.key === 'Enter' && activeSuggestion) {
      event.preventDefault()
      chooseDepartment(activeSuggestion)
    }
  }

  const overseas = DEPARTMENTS_2026.filter(({ zone }) => zone === 'overseas')
  const hoveredProjection = hovered && hasKnownNuance(projections[hovered.properties.code])
    ? projections[hovered.properties.code]
    : undefined

  return (
    <section className="france-map-card" aria-labelledby="map-title">
      <div className="map-card-head">
        <div>
          <p className="eyebrow">Carte nationale</p>
          <h2 id="map-title" tabIndex={-1}>Choisissez un département</h2>
        </div>
        <div className="map-head-actions">
          <div className="map-key" aria-label="Légende de la carte">
            <span><i className="key-swatch renewed" /> Renouvelé en 2026</span>
            <span><i className="key-swatch quiet" /> Non renouvelé</span>
            <span><i className="key-swatch simulated" /> Scénario · liste en tête</span>
          </div>
          <button
            className="map-reset-projection"
            type="button"
            disabled={!canResetProjection}
            onClick={onResetProjection}
          >
            <RotateCcw aria-hidden="true" size={14} /> Réinitialiser la projection
          </button>
        </div>
      </div>

      <div className="map-search-wrap">
        <MapPin aria-hidden="true" size={17} />
        <input
          aria-label="Rechercher un département"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={suggestions.length ? searchListboxId : undefined}
          aria-activedescendant={
            activeSuggestion
              ? `${searchListboxId}-option-${activeSuggestion.properties.code}`
              : undefined
          }
          autoComplete="off"
          placeholder="Rechercher par nom ou numéro…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveSuggestionIndex(-1)
          }}
          onKeyDown={handleSearchKeyDown}
        />
        {suggestions.length > 0 && (
          <div id={searchListboxId} className="search-results" role="listbox">
            {suggestions.map((feature, index) => {
              const projection = hasKnownNuance(projections[feature.properties.code])
                ? projections[feature.properties.code]
                : undefined
              return (
                <button
                  key={feature.properties.code}
                  id={`${searchListboxId}-option-${feature.properties.code}`}
                  role="option"
                  aria-selected={activeSuggestionIndex === index}
                  tabIndex={-1}
                  type="button"
                  onClick={() => chooseDepartment(feature)}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                >
                  <span className="department-code">{feature.properties.code}</span>
                  <span>{feature.properties.nom}</span>
                  <span
                    className={RENEWED_CODES.has(feature.properties.code) ? 'renewal-dot active' : 'renewal-dot'}
                    style={projection ? { background: NUANCE_COLORS[projection.leaderNuance] } : undefined}
                  />
                  <span className="sr-only">
                    {projection
                      ? `${projection.leaderName} en tête`
                      : RENEWED_CODES.has(feature.properties.code)
                        ? 'Renouvelé en 2026'
                        : 'Non renouvelé en 2026'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="france-map-stage" ref={containerRef}>
        {!features.length && !loadingError && (
          <div className="map-loading"><LoaderCircle className="spin" /> Chargement des contours…</div>
        )}
        {loadingError && <div className="map-error">{loadingError}</div>}
        {pathFor && (
          <svg
            className="france-map-svg"
            viewBox="0 0 720 650"
            aria-hidden="true"
            focusable="false"
          >
            {features.map((feature) => {
              const renewed = RENEWED_CODES.has(feature.properties.code)
              const projection = renewed && hasKnownNuance(projections[feature.properties.code])
                ? projections[feature.properties.code]
                : undefined
              const fill = projection
                ? NUANCE_COLORS[projection.leaderNuance]
                : renewed ? '#a8aba8' : '#eeeeea'
              return (
                <path
                  key={feature.properties.code}
                  d={pathFor(feature.geometry)}
                  className={`department-shape ${renewed ? 'is-renewed' : 'is-quiet'} ${projection ? 'has-projection' : ''}`}
                  style={{ '--department-fill': fill } as CSSProperties}
                  onClick={() => chooseDepartment(feature)}
                  onMouseEnter={() => setHovered(feature)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{feature.properties.nom}{projection ? ` — ${projection.leaderName} en tête avec ${projection.votes} voix` : ''}</title>
                </path>
              )
            })}
          </svg>
        )}
        {hovered && (
          <div className="map-tooltip" aria-hidden="true">
            <span className="department-code">{hovered.properties.code}</span>
            <strong>{hovered.properties.nom}</strong>
            <small>
              {RENEWED_CODES.has(hovered.properties.code)
                ? hoveredProjection
                  ? `${hoveredProjection.leaderName} en tête · ${hoveredProjection.votes.toLocaleString('fr-FR')} voix`
                  : `${DEPARTMENT_BY_CODE.get(hovered.properties.code)?.seats ?? 0} siège(s) · ouvrir`
                : 'Pas de renouvellement en 2026'}
            </small>
          </div>
        )}
      </div>

      <div className="overseas-strip">
        <span>Outre-mer</span>
        <div>
          {overseas.map((department) => (
            <button
              key={department.code}
              className={hasKnownNuance(projections[department.code]) ? 'has-projection' : ''}
              style={hasKnownNuance(projections[department.code]) ? { '--projection-color': NUANCE_COLORS[projections[department.code]!.leaderNuance] } as CSSProperties : undefined}
              type="button"
              onClick={() => onSelect(department.code)}
            >
              <span>{department.code}</span> {department.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
