import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { LoaderCircle, LocateFixed, Minus, Plus, Search } from 'lucide-react'
import type { VotingMethod } from '../data/election2026'
import { createPathBuilder, fetchGeoJSON, type GeoFeature } from '../lib/geo'

interface DepartmentMapProps {
  departmentCode: string
  method: VotingMethod
  activeListName: string | null
  selectedCommuneCode: string | null
  fillFor: (feature: GeoFeature) => string
  statusFor: (feature: GeoFeature) => string
  onSelectCommune: (feature: GeoFeature) => void
}

export function DepartmentMap({
  departmentCode,
  method,
  activeListName,
  selectedCommuneCode,
  fillFor,
  statusFor,
  onSelectCommune,
}: DepartmentMapProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [hovered, setHovered] = useState<GeoFeature | null>(null)
  const [zoom, setZoom] = useState(1)
  const searchListboxId = useId()

  useEffect(() => {
    const controller = new AbortController()
    setFeatures([])
    setError('')
    setZoom(1)
    fetchGeoJSON(`/data/communes/${departmentCode}.geojson`, controller.signal)
      .then(({ features: loaded }) => setFeatures(loaded))
      .catch((loadError: Error) => {
        if (loadError.name !== 'AbortError') setError(loadError.message)
      })
    return () => controller.abort()
  }, [departmentCode])

  const featuresWithPaths = useMemo(() => {
    if (!features.length) return []
    const pathFor = createPathBuilder(features, 820, 620, 28, { geographicAspect: true })
    return features.map((feature) => ({
      feature,
      path: pathFor(feature.geometry),
    }))
  }, [features])

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr')
    if (!normalized) return []
    return features
      .filter(({ properties }) =>
        `${properties.code} ${properties.nom}`.toLocaleLowerCase('fr').includes(normalized),
      )
      .slice(0, 7)
  }, [features, query])
  const activeSuggestion = suggestions[activeSuggestionIndex]

  const select = (feature: GeoFeature) => {
    setQuery('')
    setActiveSuggestionIndex(-1)
    onSelectCommune(feature)
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
      select(activeSuggestion)
    }
  }

  return (
    <section className="department-map-card" aria-label="Carte des communes">
      <div className="map-toolbar">
        <div className="commune-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Rechercher une commune"
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
            placeholder="Rechercher une commune…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveSuggestionIndex(-1)
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {suggestions.length > 0 && (
            <div id={searchListboxId} className="search-results commune-results" role="listbox">
              {suggestions.map((feature, index) => (
                <button
                  key={feature.properties.code}
                  id={`${searchListboxId}-option-${feature.properties.code}`}
                  type="button"
                  role="option"
                  aria-selected={activeSuggestionIndex === index}
                  tabIndex={-1}
                  onClick={() => select(feature)}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                >
                  <span>{feature.properties.nom}</span>
                  <small>{feature.properties.code}</small>
                  <span className="sr-only">{statusFor(feature)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="zoom-controls" aria-label="Contrôles de zoom">
          <button type="button" aria-label="Dézoomer" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>
            <Minus size={16} />
          </button>
          <button type="button" aria-label="Réinitialiser le zoom" onClick={() => setZoom(1)}>
            <LocateFixed size={16} />
          </button>
          <button type="button" aria-label="Zoomer" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="active-list-hint" aria-live="polite">
        <span className={activeListName ? 'pulse-dot' : 'pulse-dot muted'} />
        {activeListName
          ? `${method === 'majority' ? 'Candidature' : 'Liste'} active : ${activeListName}. Cliquez sur une commune pour attribuer ses électeurs.`
          : `Sélectionnez d’abord ${method === 'majority' ? 'une candidature' : 'une liste'}, puis ouvrez une commune.`}
      </div>

      <div className="department-map-stage">
        {!features.length && !error && (
          <div className="map-loading"><LoaderCircle className="spin" /> Chargement des communes…</div>
        )}
        {error && <div className="map-error">{error}</div>}
        {featuresWithPaths.length > 0 && (
          <svg
            className="department-communes-svg"
            viewBox="0 0 820 620"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
          >
            <g style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 180ms ease' }}>
              {featuresWithPaths.map(({ feature, path }) => (
                <path
                  key={feature.properties.code}
                  d={path}
                  fill={fillFor(feature)}
                  className={`commune-shape ${selectedCommuneCode === feature.properties.code ? 'is-selected' : ''}`}
                  onClick={() => select(feature)}
                  onMouseEnter={() => setHovered(feature)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>{feature.properties.nom}</title>
                </path>
              ))}
            </g>
          </svg>
        )}
        {hovered && (
          <div className="commune-tooltip" aria-hidden="true">
            <strong>{hovered.properties.nom}</strong>
            <small>{hovered.properties.code}</small>
          </div>
        )}
        <div className="commune-count">{features.length || '—'} communes</div>
      </div>
    </section>
  )
}
