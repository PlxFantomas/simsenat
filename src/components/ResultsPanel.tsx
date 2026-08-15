import { ChevronRight, Info, UsersRound } from 'lucide-react'
import { NUANCE_COLORS, type VotingMethod } from '../data/election2026'
import type { SimulationList } from '../data/demo'

export interface DisplayResult {
  list: SimulationList
  votes: number
  seats: number
}

interface ResultsPanelProps {
  results: DisplayResult[]
  totalVotes: number
  assignedElectors: number
  electorate: number
  seats: number
  method: VotingMethod
  warnings?: string[]
  onOpenCoverage: () => void
}

export function ResultsPanel({
  results,
  totalVotes,
  assignedElectors,
  electorate,
  seats,
  method,
  warnings = [],
  onOpenCoverage,
}: ResultsPanelProps) {
  const leaderVotes = Math.max(1, ...results.map(({ votes }) => votes))
  const unassigned = Math.max(0, electorate - assignedElectors)
  const percentageDenominator = method === 'majority' ? electorate : totalVotes
  const seatOwners = results.flatMap((result) =>
    Array.from({ length: result.seats }, () => result),
  )

  return (
    <aside className="results-panel" aria-labelledby="results-title">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Calcul en direct</p>
          <h2 id="results-title">Projection des sièges</h2>
        </div>
        <span className="live-badge"><i /> Live</span>
      </div>

      <div className="seat-summary">
        <span>{seats}</span>
        <div><strong>sièges à pourvoir</strong><small>{method === 'proportional' ? 'Plus forte moyenne' : 'Majoritaire · tour décisif'}</small></div>
      </div>

      <div className="seat-dots" aria-label={`${seats} sièges projetés`}>
        {Array.from({ length: seats }, (_, seatIndex) => {
          const owner = seatOwners[seatIndex]
          return <i key={seatIndex} style={{ background: owner ? NUANCE_COLORS[owner.list.nuance] : '#deded8' }} />
        })}
      </div>

      <div className="result-list">
        {results.map(({ list, votes, seats: wonSeats }) => (
          <div className="result-row" key={list.id}>
            <div className="result-name-row">
              <span className="party-dot" style={{ background: NUANCE_COLORS[list.nuance] }} />
              <strong>{list.shortName}</strong>
              <b>{wonSeats} <small>siège{wonSeats > 1 ? 's' : ''}</small></b>
            </div>
            <div className="result-bar-track">
              <i style={{ width: `${(votes / leaderVotes) * 100}%`, background: NUANCE_COLORS[list.nuance] }} />
            </div>
            <div className="result-votes"><span>{votes.toLocaleString('fr-FR')} voix</span><span>{percentageDenominator ? ((votes / percentageDenominator) * 100).toFixed(1).replace('.', ',') : '0,0'} % {method === 'majority' ? 'du collège' : ''}</span></div>
          </div>
        ))}
      </div>

      <button
        className="coverage-card"
        type="button"
        aria-haspopup="dialog"
        aria-label={`Couverture du scénario : ${unassigned.toLocaleString('fr-FR')} électeurs à répartir. Voir les communes.`}
        onClick={onOpenCoverage}
      >
        <div className="coverage-top"><UsersRound size={17} /><strong>Couverture du scénario</strong><span>{Math.round((assignedElectors / Math.max(1, electorate)) * 100)} % <ChevronRight size={13} /></span></div>
        <div className="coverage-track" role="progressbar" aria-label="Couverture départementale" aria-valuemin={0} aria-valuemax={electorate} aria-valuenow={assignedElectors}><i style={{ width: `${Math.min(100, (assignedElectors / Math.max(1, electorate)) * 100)}%` }} /></div>
        <p>{assignedElectors.toLocaleString('fr-FR')} électeurs affectés · {unassigned.toLocaleString('fr-FR')} à répartir</p>
      </button>

      <div className="method-note">
        <Info size={16} />
        <p>
          {method === 'proportional'
            ? 'Répartition sans seuil, à la plus forte moyenne. Une égalité complète reste départagée techniquement tant que l’âge du prochain candidat n’est pas renseigné.'
            : 'Projection du tour décisif à la majorité relative, si tous les sièges restent à pourvoir après le premier tour. Une égalité légale se départage à l’âge.'}
        </p>
      </div>
      {warnings.length > 0 && (
        <div className="projection-warning" role="status">
          <strong>Résultat à départager</strong>
          <p>{warnings[0]}</p>
        </div>
      )}
    </aside>
  )
}
