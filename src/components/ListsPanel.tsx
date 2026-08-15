import { useState } from 'react'
import { ChevronDown, ExternalLink, Plus, UserRound } from 'lucide-react'
import { NUANCE_COLORS, type VotingMethod } from '../data/election2026'
import type { SimulationList } from '../data/demo'

interface ListsPanelProps {
  lists: SimulationList[]
  method: VotingMethod
  activeListId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

export function ListsPanel({ lists, method, activeListId, onSelect, onAdd }: ListsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const hasAnnounced = lists.some((list) => list.status === 'announced')

  return (
    <aside className="lists-panel" aria-labelledby="lists-title">
      <div className="panel-title-row">
        <div>
          <p className="eyebrow">Scénario</p>
          <h2 id="lists-title">{method === 'majority' ? 'Candidatures' : 'Listes'}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onAdd} aria-label={`Ajouter ${method === 'majority' ? 'une candidature' : 'une liste'}`}>
          <Plus size={18} />
        </button>
      </div>
      <p className="panel-helper">Sélectionnez {method === 'majority' ? 'une candidature' : 'une liste'} avant d’attribuer des voix.</p>

      <div className="list-stack">
        {lists.map((list) => {
          const selected = activeListId === list.id
          const expanded = expandedId === list.id
          return (
            <article key={list.id} className={`list-card ${selected ? 'is-active' : ''}`}>
              <button className="list-select" type="button" onClick={() => onSelect(list.id)}>
                <i className="party-line" style={{ background: NUANCE_COLORS[list.nuance] }} />
                <span className="list-card-copy">
                  <span className="list-name">{list.name}</span>
                  <span className="list-meta">
                    <span>{list.nuance}</span>
                    <span>·</span>
                    <span>{list.status === 'working' ? (method === 'majority' ? 'candidature de travail' : 'liste de travail') : list.status === 'announced' ? 'annoncée · non officielle' : 'officielle'}</span>
                  </span>
                </span>
                <span className={`radio-mark ${selected ? 'checked' : ''}`} aria-hidden="true" />
              </button>
              <button
                className="composition-toggle"
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : list.id)}
              >
                <UserRound size={14} />
                {list.head}
                <ChevronDown className={expanded ? 'rotate' : ''} size={15} />
              </button>
              {expanded && (
                <ol className="candidate-list">
                  {list.members.map((member) => (
                    <li key={member.id}>
                      <span>{member.position}</span>
                      <div><strong>{member.name}</strong><small>{member.politicalLabel ?? member.nuance}{member.functions ? ` · ${member.functions}` : ''}</small></div>
                    </li>
                  ))}
                </ol>
              )}
              {list.sourceUrl && (
                <a className="list-source-link" href={list.sourceUrl} target="_blank" rel="noreferrer">
                  {list.sourceLabel ?? 'Source de l’annonce'} <ExternalLink size={11} />
                </a>
              )}
            </article>
          )
        })}
      </div>

      <button className="add-list-button" type="button" onClick={onAdd}>
        <Plus size={16} /> Ajouter {method === 'majority' ? 'une candidature' : 'une liste de travail'}
      </button>
      <div className="list-disclaimer">
        <span>!</span>
        <p>{hasAnnounced ? `Ébauches relevées sur Wikipédia au 15 août 2026. Elles peuvent être incomplètes ou changer avant le dépôt officiel du 7 au 11 septembre.` : `Aucune annonce structurée n’est encore recensée ici ; ces ${method === 'majority' ? 'candidatures' : 'listes'} restent des supports de travail.`}</p>
      </div>
    </aside>
  )
}
