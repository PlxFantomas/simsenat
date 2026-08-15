import { Plus, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { NUANCE_COLORS, NUANCES, type Nuance, type VotingMethod } from '../data/election2026'
import type { BulkAllocation, BulkRule } from '../domain/scenario'
import { bulkAllocationsFor, calculateBulkDistribution } from '../domain/scenario'
import type { SimulationList } from '../data/demo'
import { useDialogFocus } from '../lib/dialog'

interface BulkAssignmentModalProps {
  lists: SimulationList[]
  method: VotingMethod
  electorateByNuance: Partial<Record<Nuance, number>>
  extraDelegatesByNuance: Partial<Record<Nuance, number>>
  includesSupplementaryDelegates: boolean
  rules: Partial<Record<Nuance, BulkRule>>
  onChange: (nuance: Nuance, rule: BulkRule) => void
  onReset: () => void
  onClose: () => void
}

const boundedPercentage = (value: number, maximum: number) =>
  Math.min(maximum, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))

export function BulkAssignmentModal({
  lists,
  method,
  electorateByNuance,
  extraDelegatesByNuance,
  includesSupplementaryDelegates,
  rules,
  onChange,
  onReset,
  onClose,
}: BulkAssignmentModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  const validListIds = new Set(lists.map(({ id }) => id))
  const beneficiary = method === 'majority' ? 'candidature' : 'liste'

  const setAllocations = (nuance: Nuance, allocations: BulkAllocation[]) => {
    onChange(nuance, { allocations })
  }

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Fermer" onClick={onClose} />
      <section
        ref={dialogRef}
        className="bulk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-title"
        aria-describedby="bulk-description"
      >
        <header>
          <div className="modal-icon"><SlidersHorizontal size={20} /></div>
          <div>
            <p className="eyebrow">Présélection départementale</p>
            <h2 id="bulk-title">Affecter par nuance</h2>
            <p id="bulk-description">
              Répartissez chaque nuance entre plusieurs {method === 'majority' ? 'candidatures' : 'listes'}, puis corrigez commune par commune.
              {includesSupplementaryDelegates && ' Les délégués supplémentaires sont inclus et répartis par nuance au prorata des sièges détenus dans chaque conseil municipal.'}
            </p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </header>

        <div className="bulk-rows">
          {NUANCES.filter((nuance) => (electorateByNuance[nuance] ?? 0) > 0).map((nuance) => {
            const allocations = bulkAllocationsFor(rules[nuance])
            const count = electorateByNuance[nuance] ?? 0
            const extraCount = extraDelegatesByNuance[nuance] ?? 0
            const distribution = calculateBulkDistribution(rules[nuance], count, validListIds)
            const totalPercentage = Math.min(
              100,
              allocations.reduce(
                (total, allocation) => total + Math.max(0, Number.isFinite(allocation.percentage) ? allocation.percentage : 0),
                0,
              ),
            )
            const selectedIds = new Set(allocations.map(({ listId }) => listId))
            const availableLists = lists.filter(({ id }) => !selectedIds.has(id))

            return (
              <section className="bulk-row" key={nuance} aria-labelledby={`bulk-nuance-${nuance}`}>
                <div className="bulk-nuance">
                  <i style={{ background: NUANCE_COLORS[nuance] }} />
                  <span>
                    <strong id={`bulk-nuance-${nuance}`}>{nuance}</strong>
                    <small>{count.toLocaleString('fr-FR')} grand{count > 1 ? 's' : ''} électeur{count > 1 ? 's' : ''} estimé{count > 1 ? 's' : ''}</small>
                    {includesSupplementaryDelegates && extraCount > 0 && (
                      <small className="bulk-count-basis">
                        dont {extraCount.toLocaleString('fr-FR')} délégué{extraCount > 1 ? 's' : ''} supplémentaire{extraCount > 1 ? 's' : ''}
                      </small>
                    )}
                  </span>
                  <span
                    className="bulk-row-summary"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <strong>{totalPercentage} % affectés</strong>
                    <small>{distribution.assignedElectors.toLocaleString('fr-FR')} sur {count.toLocaleString('fr-FR')}</small>
                  </span>
                </div>

                <div className="bulk-allocation-list">
                  {allocations.length === 0 && (
                    <p className="bulk-empty">Aucune présélection pour cette nuance.</p>
                  )}
                  {allocations.map((allocation, allocationIndex) => {
                    const otherPercentage = allocations.reduce(
                      (total, item, index) => index === allocationIndex
                        ? total
                        : total + Math.max(0, Number.isFinite(item.percentage) ? item.percentage : 0),
                      0,
                    )
                    const maximum = Math.max(0, 100 - otherPercentage)
                    const allocatedVotes = distribution.votesByList[allocation.listId] ?? 0
                    return (
                      <div className="bulk-allocation-row" key={`${allocation.listId}-${allocationIndex}`}>
                        <select
                          aria-label={`${beneficiary === 'candidature' ? 'Candidature' : 'Liste'} ${allocationIndex + 1} pour ${nuance}`}
                          value={allocation.listId}
                          onChange={(event) => {
                            const next = allocations.map((item, index) =>
                              index === allocationIndex ? { ...item, listId: event.target.value } : item,
                            )
                            setAllocations(nuance, next)
                          }}
                        >
                          {lists
                            .filter(({ id }) => id === allocation.listId || !selectedIds.has(id))
                            .map((list) => <option key={list.id} value={list.id}>{list.shortName} · {list.nuance}</option>)}
                        </select>
                        <label className="bulk-percentage-input">
                          <span className="sr-only">Pourcentage de {nuance} pour {lists.find(({ id }) => id === allocation.listId)?.shortName ?? beneficiary}</span>
                          <input
                            type="number"
                            min="0"
                            max={maximum}
                            step="5"
                            value={allocation.percentage}
                            onChange={(event) => {
                              const next = allocations.map((item, index) =>
                                index === allocationIndex
                                  ? { ...item, percentage: boundedPercentage(Number(event.target.value), maximum) }
                                  : item,
                              )
                              setAllocations(nuance, next)
                            }}
                          />
                          <b>%</b>
                          <small>jusqu’à {allocatedVotes.toLocaleString('fr-FR')} voix</small>
                        </label>
                        <button
                          className="bulk-remove"
                          type="button"
                          aria-label={`Supprimer ${lists.find(({ id }) => id === allocation.listId)?.shortName ?? beneficiary} de la répartition ${nuance}`}
                          onClick={() => setAllocations(
                            nuance,
                            allocations.filter((_, index) => index !== allocationIndex),
                          )}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )
                  })}

                  {availableLists.length > 0 && (
                    <label className="bulk-add-list">
                      <Plus size={14} />
                      <span className="sr-only">Ajouter une {beneficiary} pour {nuance}</span>
                      <select
                        aria-label={`Ajouter une ${beneficiary} pour ${nuance}`}
                        value=""
                        onChange={(event) => {
                          if (!event.target.value) return
                          setAllocations(nuance, [
                            ...allocations,
                            {
                              listId: event.target.value,
                              percentage: Math.max(0, 100 - totalPercentage),
                            },
                          ])
                        }}
                      >
                        <option value="">Ajouter une {beneficiary}…</option>
                        {availableLists.map((list) => <option key={list.id} value={list.id}>{list.shortName} · {list.nuance}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </section>
            )
          })}
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={onReset}><RotateCcw size={15} /> Tout effacer</button>
          <div><span>Les parts sont exclusives et leur total ne dépasse jamais 100 %.</span><button className="primary-button" type="button" onClick={onClose}>Terminer</button></div>
        </footer>
      </section>
    </div>
  )
}
