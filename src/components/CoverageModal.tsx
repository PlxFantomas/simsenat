import { CheckCircle2, ChevronRight, MapPinned, Search, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { VotingMethod } from '../data/election2026'
import type { SimulationList } from '../data/demo'
import type { CommuneCoverage } from '../domain/coverage'
import { useDialogFocus } from '../lib/dialog'

interface CoverageModalProps {
  communes: readonly CommuneCoverage[]
  lists: readonly SimulationList[]
  activeListId: string | null
  method: VotingMethod
  assignedElectors: number
  electorate: number
  unlocatedTotal: number
  unlocatedAssigned: number
  onSelectList: (listId: string) => void
  onOpenCommune: (coverage: CommuneCoverage) => void
  onOpenBulk: () => void
  onClose: () => void
}

const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR')

export function CoverageModal({
  communes,
  lists,
  activeListId,
  method,
  assignedElectors,
  electorate,
  unlocatedTotal,
  unlocatedAssigned,
  onSelectList,
  onOpenCommune,
  onOpenBulk,
  onClose,
}: CoverageModalProps) {
  const [query, setQuery] = useState('')
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  const incompleteCommunes = useMemo(
    () => communes
      .filter(({ remaining }) => remaining > 0)
      .sort((left, right) => right.remaining - left.remaining || left.profile.name.localeCompare(right.profile.name, 'fr')),
    [communes],
  )
  const filteredCommunes = useMemo(() => {
    const normalized = normalizeSearch(query.trim())
    if (!normalized) return incompleteCommunes
    return incompleteCommunes.filter(({ profile }) =>
      normalizeSearch(`${profile.name} ${profile.code}`).includes(normalized),
    )
  }, [incompleteCommunes, query])
  const localTotal = communes.reduce((sum, commune) => sum + commune.total, 0)
  const localAssigned = communes.reduce((sum, commune) => sum + commune.assigned, 0)
  const localRemaining = Math.max(0, localTotal - localAssigned)
  const unlocatedRemaining = Math.max(0, unlocatedTotal - unlocatedAssigned)
  const activeLabel = method === 'majority' ? 'Candidature active' : 'Liste active'

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <section ref={dialogRef} className="coverage-modal" role="dialog" aria-modal="true" aria-labelledby="coverage-title">
        <header>
          <div className="modal-icon"><MapPinned size={20} /></div>
          <div>
            <p className="eyebrow">Avancement du scénario</p>
            <h2 id="coverage-title">Communes à compléter</h2>
            <p>Repérez les grands électeurs municipaux encore sans affectation et ouvrez directement leur commune.</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </header>

        <div className="coverage-modal-body">
          <div className="coverage-summary-grid">
            <div><strong>{incompleteCommunes.length.toLocaleString('fr-FR')}</strong><span>communes à compléter</span></div>
            <div><strong>{localRemaining.toLocaleString('fr-FR')}</strong><span>électeurs localisables à répartir</span></div>
            <div><strong>{Math.round((assignedElectors / Math.max(1, electorate)) * 100)} %</strong><span>du collège départemental affecté</span></div>
          </div>

          <label className="coverage-active-list">
            <span>{activeLabel} pour les attributions</span>
            <select value={activeListId ?? ''} onChange={(event) => onSelectList(event.target.value)}>
              <option value="" disabled>Choisir…</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.shortName} · {list.nuance}</option>)}
            </select>
          </label>

          {unlocatedTotal > 0 && (
            <div className="coverage-unlocated">
              <div>
                <strong>Autres membres du collège</strong>
                <p>{unlocatedRemaining.toLocaleString('fr-FR')} sur {unlocatedTotal.toLocaleString('fr-FR')} restent à répartir. Ils regroupent les électeurs non rattachés à une commune et le recalage au total officiel.</p>
              </div>
              <button type="button" onClick={onOpenBulk}><SlidersHorizontal size={14} /> Affecter par nuance</button>
            </div>
          )}

          <div className="coverage-list-head">
            <label>
              <Search size={15} />
              <span className="sr-only">Rechercher une commune incomplète</span>
              <input
                type="search"
                value={query}
                placeholder="Rechercher une commune…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span aria-live="polite">{filteredCommunes.length.toLocaleString('fr-FR')} résultat{filteredCommunes.length > 1 ? 's' : ''}</span>
          </div>

          <div className="coverage-commune-list">
            {filteredCommunes.map((coverage) => {
              const { profile } = coverage
              const percentage = Math.round((coverage.assigned / Math.max(1, coverage.total)) * 100)
              return (
                <button
                  type="button"
                  key={profile.code}
                  disabled={!activeListId}
                  aria-label={`${profile.name}, ${coverage.remaining} électeur${coverage.remaining > 1 ? 's' : ''} à répartir. Ouvrir et attribuer.`}
                  onClick={() => onOpenCommune(coverage)}
                >
                  <span className="coverage-commune-name"><strong>{profile.name}</strong><small>{profile.code}</small></span>
                  <span className="coverage-commune-progress">
                    <span><strong>{coverage.assigned} / {coverage.total}</strong><small>{coverage.remaining} à répartir</small></span>
                    <i role="progressbar" aria-label={`Couverture de ${profile.name}`} aria-valuemin={0} aria-valuemax={coverage.total} aria-valuenow={coverage.assigned}><b style={{ width: `${percentage}%` }} /></i>
                    <small>Conseil {coverage.councilAssigned}/{coverage.councilTotal}{coverage.extraTotal > 0 ? ` · supplémentaires ${coverage.extraAssigned}/${coverage.extraTotal}` : ''}</small>
                  </span>
                  <span className="coverage-open-label">Ouvrir et attribuer <ChevronRight size={15} /></span>
                </button>
              )
            })}

            {filteredCommunes.length === 0 && (
              <div className="coverage-empty-state">
                <CheckCircle2 size={24} />
                <strong>{incompleteCommunes.length === 0 ? 'Toutes les communes sont complètes' : 'Aucune commune ne correspond'}</strong>
                <p>{incompleteCommunes.length === 0 ? 'Les éventuels électeurs restants figurent dans le bloc départemental ci-dessus.' : 'Essayez un autre nom ou code commune.'}</p>
              </div>
            )}
          </div>

          {!activeListId && <p className="coverage-list-warning">Choisissez d’abord une {method === 'majority' ? 'candidature' : 'liste'} pour ouvrir une commune et attribuer ses électeurs.</p>}
        </div>

        <footer><button className="primary-button" type="button" onClick={onClose}>Terminer</button></footer>
      </section>
    </div>
  )
}
