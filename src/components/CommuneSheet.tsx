import { useState } from 'react'
import { Check, ChevronDown, ExternalLink, Landmark, UserRound, UsersRound, X } from 'lucide-react'
import { NUANCE_COLORS, type Nuance, type VotingMethod } from '../data/election2026'
import type { CommuneProfile, Elector, MunicipalGroup, SimulationList } from '../data/demo'
import { useDialogFocus } from '../lib/dialog'

interface CommuneSheetProps {
  profile: CommuneProfile
  lists: SimulationList[]
  activeListId: string | null
  method: VotingMethod
  seats: number
  extraAssignments: Record<string, number>
  extraDelegatePoolByNuance: Readonly<Record<string, number>>
  extraBulkVotesByList: Readonly<Record<string, number>>
  assignedListsFor: (elector: Elector) => readonly string[]
  assignmentSourceFor: (elector: Elector) => 'local' | 'bulk' | 'none'
  onToggleElector: (elector: Elector) => void
  onAssignGroup: (group: MunicipalGroup) => void
  onSetExtra: (listId: string, votes: number) => void
  onClose: () => void
}

export function CommuneSheet({
  profile,
  lists,
  activeListId,
  method,
  seats,
  extraAssignments,
  extraDelegatePoolByNuance,
  extraBulkVotesByList,
  assignedListsFor,
  assignmentSourceFor,
  onToggleElector,
  onAssignGroup,
  onSetExtra,
  onClose,
}: CommuneSheetProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['majority'])
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  const activeList = lists.find(({ id }) => id === activeListId) ?? null
  const maxVotesPerElector = method === 'majority' ? seats : 1
  const usedExtra = Object.values(extraAssignments).reduce((sum, votes) => sum + votes, 0)
  const preselectedExtraVotes = Object.values(extraBulkVotesByList).reduce((sum, votes) => sum + votes, 0)
  const extraCapacity = profile.extraDelegates * maxVotesPerElector
  const municipalDelegateCount = profile.municipalDelegateCount ?? profile.councilElectors
  const councilMemberCount = profile.councilMemberCount ?? profile.councilElectors
  const sourced = profile.dataQuality === 'imported'
  const designationUnknown = profile.delegateSelection === 'designation-unknown'

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    )
  }

  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-backdrop" type="button" aria-label="Fermer la commune" onClick={onClose} />
      <aside ref={dialogRef} className="commune-sheet" role="dialog" aria-modal="true" aria-labelledby="commune-title">
        <header className="sheet-header">
          <div>
            <div className="sheet-kicker"><span>{profile.code}</span> Commune</div>
            <h2 id="commune-title">{profile.name}</h2>
            <p>{municipalDelegateCount + profile.extraDelegates} délégués municipaux modélisés</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>

        {sourced ? (
          <div className="demo-ribbon source-ribbon">
            <span>RNE · 5 août 2026</span>
            {designationUnknown
              ? `${councilMemberCount} conseillers officiels ; les ${municipalDelegateCount} délégués désignés ne sont pas identifiés dans la source nationale.`
              : 'Conseillers grands électeurs de droit ; groupes reconstruits depuis les listes municipales.'}
            {profile.sourceUrl && <a href={profile.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={11} /></a>}
          </div>
        ) : (
          <div className="demo-ribbon"><span>Données de démonstration</span> Aucun profil RNE exploitable n’est chargé pour cette commune.</div>
        )}

        <div className="sheet-body">
          <section className="mayor-card">
            <div className="avatar-placeholder"><Landmark size={19} /></div>
            <div><small>Maire</small><strong>{profile.mayorName}</strong><span><i style={{ background: NUANCE_COLORS[profile.mayorNuance] }} /> {profile.mayorNuance}</span></div>
          </section>

          <div className="active-assignment-card">
            <span className={activeList ? 'pulse-dot' : 'pulse-dot muted'} />
            <div><small>{method === 'majority' ? 'Candidature active' : 'Liste active'}</small><strong>{activeList?.name ?? `Aucune ${method === 'majority' ? 'candidature' : 'liste'} sélectionnée`}</strong></div>
            {activeList && <span className="party-tag" style={{ '--party': NUANCE_COLORS[activeList.nuance] } as React.CSSProperties}>{activeList.nuance}</span>}
          </div>

          <section className="groups-section" aria-labelledby="groups-heading">
            <div className="section-heading"><div><p className="eyebrow">Conseil municipal</p><h3 id="groups-heading">Listes d’élection & élus</h3></div><span>{councilMemberCount} conseillers · {municipalDelegateCount} délégués</span></div>
            {designationUnknown && (
              <p className="section-copy data-caveat">Sélectionnez les conseillers que vous retenez dans votre hypothèse. Leur désignation effective comme grand électeur doit être vérifiée dans le tableau préfectoral.</p>
            )}

            {profile.groups.map((group) => {
              const expanded = expandedGroups.includes(group.id)
              const groupAssignments = group.electors.map((elector) => ({
                elector,
                assignment: assignedListsFor(elector),
                source: assignmentSourceFor(elector),
              }))
              const assignedToActive = activeList
                ? groupAssignments.filter(({ assignment }) => assignment.includes(activeList.id)).length
                : 0
              const inheritedCount = groupAssignments.filter(
                ({ assignment, source }) => source === 'bulk' && assignment.length > 0,
              ).length
              return (
                <article className="group-card" key={group.id}>
                  <div className="group-card-head">
                    <button type="button" className="group-expand" onClick={() => toggleGroup(group.id)} aria-expanded={expanded}>
                      <i style={{ background: NUANCE_COLORS[group.nuance] }} />
                      <span><strong>{group.name}</strong><small>{group.nuance} · {group.electors.length} élu{group.electors.length > 1 ? 's' : ''}{inheritedCount > 0 ? ` · ${inheritedCount} par présélection` : ''}</small></span>
                      <ChevronDown className={expanded ? 'rotate' : ''} size={17} />
                    </button>
                    <button
                      type="button"
                      className="assign-all"
                      disabled={!activeList}
                      aria-pressed={assignedToActive === 0 ? false : assignedToActive === group.electors.length ? true : 'mixed'}
                      aria-label={activeList ? `${assignedToActive}/${group.electors.length} élus affectés à ${activeList.name}` : 'Aucune liste active'}
                      onClick={() => onAssignGroup(group)}
                    >
                      {assignedToActive === group.electors.length && group.electors.length > 0 ? <Check size={14} /> : <UsersRound size={14} />}
                      {designationUnknown ? 'Tout modéliser' : 'Tout affecter'}
                    </button>
                  </div>
                  {expanded && (
                    <div className="elector-list">
                      {group.electors.map((elector) => {
                        const assignedIds = assignedListsFor(elector)
                        const assignmentSource = assignmentSourceFor(elector)
                        const selected = Boolean(activeList && assignedIds.includes(activeList.id))
                        const assignedNames = assignedIds
                          .map((listId) => lists.find(({ id }) => id === listId)?.shortName)
                          .filter((name): name is string => Boolean(name))
                        const assignmentCaption = assignmentSource === 'bulk' && assignedNames.length > 0
                          ? `Vote simulé : ${assignedNames.join(', ')} · présélection ${group.nuance}`
                          : assignmentSource === 'local'
                            ? assignedNames.length > 0
                              ? `Vote simulé : ${assignedNames.join(', ')} · correction locale`
                              : 'Non affecté · correction locale'
                            : ''
                        const actionLabel = activeList
                          ? selected
                            ? `Retirer ${activeList.name}`
                            : `Affecter à ${activeList.name}`
                          : 'Aucune liste active'
                        return (
                          <button
                            key={elector.id}
                            type="button"
                            disabled={!activeList}
                            aria-pressed={selected}
                            aria-label={`${elector.name}. ${elector.role}. ${assignmentCaption || 'Aucune affectation'}. ${actionLabel}.`}
                            onClick={() => onToggleElector(elector)}
                            className={selected ? 'is-assigned' : ''}
                          >
                            <span className="elector-avatar"><UserRound size={15} /></span>
                            <span>
                              <strong>{elector.name}</strong>
                              <small>{elector.role}</small>
                              {assignmentCaption && <small className={`assignment-caption is-${assignmentSource}`}>{assignmentCaption}</small>}
                            </span>
                            <span className="assignment-marks">
                              {assignedIds.slice(0, maxVotesPerElector).map((listId) => {
                                const list = lists.find(({ id }) => id === listId)
                                return list ? <i key={listId} title={list.name} style={{ background: NUANCE_COLORS[list.nuance] }} /> : null
                              })}
                            </span>
                            <span className={`check-mark ${selected ? 'checked' : ''}`}>{selected && <Check size={13} />}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </article>
              )
            })}
          </section>

          {profile.extraDelegates > 0 && (
            <section className="extra-section">
              <div className="section-heading"><div><p className="eyebrow">Hors conseil</p><h3>Délégués supplémentaires</h3></div><span>{profile.extraDelegates}</span></div>
              <p className="section-copy">La nuance de ces délégués est estimée au prorata des sièges détenus par chaque nuance au conseil municipal. La présélection départementale s’applique automatiquement ; les valeurs ci-dessous servent de correction locale par {method === 'majority' ? 'candidature' : 'liste'}. {method === 'majority' ? `Chaque délégué peut soutenir jusqu’à ${seats} candidatures.` : ''}</p>
              <div className="extra-nuance-breakdown" aria-label="Répartition estimée des délégués supplémentaires par nuance">
                {Object.entries(extraDelegatePoolByNuance)
                  .filter(([, count]) => count > 0)
                  .map(([nuance, count]) => (
                    <span key={nuance}>
                      <i style={{ background: NUANCE_COLORS[nuance as Nuance] }} />
                      <strong>{nuance}</strong>
                      <b>{count}</b>
                    </span>
                  ))}
              </div>
              <div className="extra-grid">
                {lists.map((list) => (
                  <label key={list.id}>
                    <span><i style={{ background: NUANCE_COLORS[list.nuance] }} /> {list.shortName}</span>
                    {(extraBulkVotesByList[list.id] ?? 0) > 0 && (
                      <small className="extra-bulk-badge">{extraBulkVotesByList[list.id]} préaff.</small>
                    )}
                    <input
                      type="number"
                      min="0"
                      max={profile.extraDelegates}
                      aria-label={`Correction locale pour ${list.shortName}`}
                      value={extraAssignments[list.id] ?? 0}
                      onChange={(event) => onSetExtra(list.id, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
              <div className="extra-total">
                <span>{preselectedExtraVotes.toLocaleString('fr-FR')} voix par présélection · corrections locales</span>
                <strong>{usedExtra} / {extraCapacity}</strong>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  )
}
