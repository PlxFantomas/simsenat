import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Database,
  Download,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Vote,
} from 'lucide-react'
import { AddListModal } from './components/AddListModal'
import { BulkAssignmentModal } from './components/BulkAssignmentModal'
import { CommuneSheet } from './components/CommuneSheet'
import { CoverageModal } from './components/CoverageModal'
import { DepartmentMap } from './components/DepartmentMap'
import { FranceMap } from './components/FranceMap'
import { ListsPanel } from './components/ListsPanel'
import { LegalModal, type LegalPage } from './components/LegalModal'
import { ResultsPanel, type DisplayResult } from './components/ResultsPanel'
import { SourcesModal } from './components/SourcesModal'
import {
  DEPARTMENT_BY_CODE,
  NUANCE_COLORS,
  SOURCE_LINKS,
  votingMethodFor,
  type Nuance,
} from './data/election2026'
import {
  createDemoCommune,
  demoElectorateByNuance,
  emptyScenario,
  stablePercentile,
  type BulkRule,
  type CommuneProfile,
  type DepartmentProjectionSummary,
  type DepartmentScenario,
  type Elector,
  type MunicipalGroup,
} from './data/demo'
import { mergeAnnouncedListsIntoScenario } from './data/announcedLists'
import {
  loadMunicipalData,
  type MunicipalDepartmentData,
} from './data/municipalData'
import type { GeoFeature } from './lib/geo'
import { downloadJSON, useStoredState } from './lib/storage'
import {
  allocateProportionalSeats,
  getCommuneDominance,
  runMajorityElection,
} from './domain/election'
import {
  calculateScenarioTotals,
  bulkAllocationsFor,
  getEffectiveElectorAssignment,
  getUniqueVoteLeader,
} from './domain/scenario'
import {
  calculateCommuneCoverage,
  calculateExtraDelegateState,
} from './domain/coverage'
import { allocateExtraDelegatesByNuance } from './domain/apportionment'
import './styles.css'

type ScenarioStore = Record<string, DepartmentScenario>

const approximateElectorate = (code: string, seats: number) => {
  const numericCode = Number.parseInt(code, 10) || code.charCodeAt(0)
  return Math.max(320, Math.round(520 + seats * 520 + (numericCode % 17) * 43))
}

function AppHeader({ onSources, onHome }: { onSources: () => void; onHome: () => void }) {
  return (
    <header className="app-header">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onHome() }} aria-label="Sénatoriales 2026">
        <span className="tricolor" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>Sénatoriales</strong><small>Simulateur · 2026</small></span>
      </a>
      <div className="header-center"><CalendarDays size={15} /> Dimanche 27 septembre 2026</div>
      <button className="source-button" type="button" onClick={onSources}>
        <ShieldCheck size={16} /> Sources & méthode
      </button>
    </header>
  )
}

function HomeScreen({
  onSelectDepartment,
  onSources,
  onResetProjection,
  canResetProjection,
  projections,
}: {
  onSelectDepartment: (code: string) => void
  onSources: () => void
  onResetProjection: () => void
  canResetProjection: boolean
  projections: Readonly<Record<string, DepartmentProjectionSummary | undefined>>
}) {
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <main className="home-main">
      <section className="home-intro">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> Renouvellement de la série 2</p>
          <h1>Composez le prochain<br /><em>Sénat français.</em></h1>
          <p className="home-lead">Explorez les collèges électoraux, attribuez les voix commune par commune et observez la projection des sièges évoluer en temps réel.</p>
        </div>
        <div className="election-brief">
          <p className="brief-number">178</p>
          <p className="brief-label">sièges renouvelés · dont 6 hors de France</p>
          <div className="brief-rule" />
          <div className="brief-row"><span>63</span><p>territoires<br />sur la carte</p></div>
          <div className="brief-row"><span>93 469</span><p>grands électeurs<br />recensés au 23 juin</p></div>
          <a href={SOURCE_LINKS.senate2026} target="_blank" rel="noreferrer">Voir le calendrier officiel <ChevronRight size={14} /></a>
        </div>
      </section>

      <div className="data-notice">
        <Database size={17} />
        <div><strong>Données enrichies — 15 août 2026</strong><span>RNE post-municipales · rattachement aux listes de mars · candidatures sénatoriales annoncées et sourcées.</span></div>
        <button type="button" onClick={onSources}>Voir le détail</button>
      </div>

      <div className="home-grid">
        <FranceMap
          onSelect={onSelectDepartment}
          onUnavailable={(name) => setNotice(`${name} ne fait pas partie du renouvellement 2026.`)}
          onResetProjection={() => {
            onResetProjection()
            setNotice('La projection nationale a été réinitialisée.')
          }}
          canResetProjection={canResetProjection}
          projections={projections}
        />
        <aside className="how-panel">
          <p className="eyebrow">Mode d’emploi</p>
          <h2>Trois gestes pour simuler</h2>
          <ol>
            <li><span>01</span><div><strong>Ouvrez un territoire</strong><p>Les départements gris sont renouvelés en septembre.</p></div></li>
            <li><span>02</span><div><strong>Choisissez une liste ou candidature</strong><p>Préaffectez par nuance ou ajustez chaque commune.</p></div></li>
            <li><span>03</span><div><strong>Affinez les voix</strong><p>Les sièges et les couleurs de la carte se recalculent instantanément.</p></div></li>
          </ol>
          <div className="method-card"><Vote size={20} /><div><strong>Deux modes de scrutin</strong><p>Proportionnelle dès 3 sièges, majoritaire à deux tours pour 1 ou 2 sièges.</p></div></div>
          <div className="privacy-mini"><ShieldCheck size={16} /><span>Scénarios enregistrés uniquement dans votre navigateur.</span></div>
        </aside>
      </div>

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  )
}

interface DepartmentScreenProps {
  code: string
  scenario: DepartmentScenario
  onUpdateScenario: (update: (current: DepartmentScenario) => DepartmentScenario) => void
  onBack: () => void
  onSources: () => void
  municipalData: MunicipalDepartmentData
}

function DepartmentScreen({ code, scenario, onUpdateScenario, onBack, onSources, municipalData }: DepartmentScreenProps) {
  const department = DEPARTMENT_BY_CODE.get(code)!
  const method = votingMethodFor(department.seats)
  const electorate = department.officialElectors ?? approximateElectorate(code, department.seats)
  const electorateByNuance = useMemo(() => {
    const sourced = municipalData.mode === 'source' ? municipalData.electorateByNuance : {}
    return Object.values(sourced).some((count) => (count ?? 0) > 0)
      ? sourced
      : demoElectorateByNuance(code, electorate)
  }, [code, electorate, municipalData])
  const extraDelegatePools = useMemo(() => Object.fromEntries(
    municipalData.communes
      .filter(({ extraDelegates }) => extraDelegates > 0)
      .map((profile) => [profile.code, allocateExtraDelegatesByNuance(profile)]),
  ), [municipalData.communes])
  const extraDelegatesByNuance = useMemo(() => {
    const totals: Partial<Record<Nuance, number>> = {}
    Object.values(extraDelegatePools).forEach((pool) => {
      Object.entries(pool).forEach(([nuance, count]) => {
        const typedNuance = nuance as Nuance
        totals[typedNuance] = (totals[typedNuance] ?? 0) + count
      })
    })
    return totals
  }, [extraDelegatePools])
  const [activeListId, setActiveListId] = useState<string | null>(scenario.lists[0]?.id ?? null)
  const [selectedProfile, setSelectedProfile] = useState<CommuneProfile | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [returnToCoverage, setReturnToCoverage] = useState(false)
  const [addListOpen, setAddListOpen] = useState(false)
  const [resetNotice, setResetNotice] = useState(false)
  const activeList = scenario.lists.find(({ id }) => id === activeListId) ?? null
  const maxVotesPerElector = method === 'majority' ? department.seats : 1

  useEffect(() => {
    if (activeListId && scenario.lists.some(({ id }) => id === activeListId)) return
    setActiveListId(scenario.lists[0]?.id ?? null)
  }, [activeListId, scenario.lists])

  const profileFor = (feature: GeoFeature) =>
    municipalData.communesByCode.get(feature.properties.code) ??
    createDemoCommune(feature.properties.code, feature.properties.nom)

  const assignmentNuanceByElectorId = useMemo(() => {
    const nuances: Record<string, Nuance> = {}
    municipalData.communes.forEach((profile) => {
      profile.groups.forEach((group) => {
        group.electors.forEach((elector) => {
          nuances[elector.id] = group.nuance
        })
      })
    })
    return nuances
  }, [municipalData.communes])

  const assignmentNuanceFor = (elector: Elector) =>
    assignmentNuanceByElectorId[elector.id] ?? elector.nuance

  const effectiveAssignmentFor = (elector: Elector) =>
    getEffectiveElectorAssignment<Nuance>({
      electorId: elector.id,
      electoralNuance: assignmentNuanceFor(elector),
      bulkRules: scenario.bulkRules,
      electorAssignments: scenario.electorAssignments,
      percentile: stablePercentile(elector.id),
    })

  const assignedListsFor = (elector: Elector) =>
    effectiveAssignmentFor(elector).listIds

  const effectiveElectorNuances = useMemo(() => {
    const nuances = { ...scenario.electorNuances }
    Object.keys(scenario.electorAssignments).forEach((electorId) => {
      const groupNuance = assignmentNuanceByElectorId[electorId]
      if (groupNuance) nuances[electorId] = groupNuance
    })
    return nuances
  }, [assignmentNuanceByElectorId, scenario.electorAssignments, scenario.electorNuances])

  const scenarioTotals = useMemo(
    () => calculateScenarioTotals<Nuance>({
      listIds: scenario.lists.map(({ id }) => id),
      electorateByNuance,
      bulkRules: scenario.bulkRules,
      electorAssignments: scenario.electorAssignments,
      electorNuances: effectiveElectorNuances,
      extraAssignments: scenario.extraAssignments,
      extraNuances: scenario.extraNuances ?? {},
      extraDelegateCounts: scenario.extraDelegateCounts ?? {},
      extraDelegatePools,
      maxVotesPerElector: maxVotesPerElector as 1 | 2,
    }),
    [effectiveElectorNuances, electorateByNuance, extraDelegatePools, maxVotesPerElector, scenario],
  )
  const { votesByList, assignedElectors } = scenarioTotals
  const mapProjection = useMemo<DepartmentProjectionSummary | undefined>(() => {
    const leader = getUniqueVoteLeader(
      scenario.lists.map(({ id }) => ({ contenderId: id, votes: votesByList[id] ?? 0 })),
    )
    if (!leader) return undefined
    const leaderList = scenario.lists.find(({ id }) => id === leader.contenderId)
    if (!leaderList) return undefined
    return {
      leaderListId: leaderList.id,
      leaderName: leaderList.shortName || leaderList.name,
      leaderNuance: leaderList.nuance,
      votes: leader.votes,
      assignedElectors,
      electorate,
    }
  }, [assignedElectors, electorate, scenario.lists, votesByList])

  useEffect(() => {
    onUpdateScenario((current) => {
      const previous = current.projectionSummary
      if (!mapProjection) {
        return previous ? { ...current, projectionSummary: undefined } : current
      }
      if (
        previous?.leaderListId === mapProjection.leaderListId &&
        previous.leaderName === mapProjection.leaderName &&
        previous.leaderNuance === mapProjection.leaderNuance &&
        previous.votes === mapProjection.votes &&
        previous.assignedElectors === mapProjection.assignedElectors &&
        previous.electorate === mapProjection.electorate
      ) {
        return current
      }
      return { ...current, projectionSummary: mapProjection }
    })
  }, [mapProjection, onUpdateScenario])

  const communeCoverages = useMemo(
    () => municipalData.communes.map((profile) => calculateCommuneCoverage<Nuance>({
      profile,
      listIds: scenario.lists.map(({ id }) => id),
      bulkRules: scenario.bulkRules,
      electorAssignments: scenario.electorAssignments,
      extraAssignments: scenario.extraAssignments[profile.code] ?? {},
      maxVotesPerElector: maxVotesPerElector as 1 | 2,
    })),
    [maxVotesPerElector, municipalData.communes, scenario],
  )
  const localizableElectors = communeCoverages.reduce(
    (total, coverage) => total + coverage.total,
    0,
  )
  const assignedLocalizableElectors = communeCoverages.reduce(
    (total, coverage) => total + coverage.assigned,
    0,
  )
  const unlocatedElectors = Math.max(0, electorate - localizableElectors)
  const assignedUnlocatedElectors = Math.min(
    unlocatedElectors,
    Math.max(0, assignedElectors - assignedLocalizableElectors),
  )

  const totalVotes = Object.values(votesByList).reduce((sum, votes) => sum + votes, 0)
  const seatProjection = useMemo(() => {
    const entries = scenario.lists.map(({ id }) => ({ contenderId: id, votes: votesByList[id] ?? 0 }))
    if (method === 'proportional') {
      const result = allocateProportionalSeats(entries, { seatCount: department.seats })
      return {
        allocation: Object.fromEntries(result.allocations.map(({ contenderId, seats }) => [contenderId, seats])),
        hasTechnicalTie: result.warnings.length > 0,
      }
    }
    const result = runMajorityElection(
      [
        { round: 1, votes: entries, validBallots: electorate, registeredVoters: electorate },
      ],
      { seatCount: department.seats as 1 | 2, roundCount: 1 },
    )
    const allocation = Object.fromEntries(scenario.lists.map(({ id }) => [id, 0]))
    result.elected.forEach(({ contenderId }) => {
      allocation[contenderId] = (allocation[contenderId] ?? 0) + 1
    })
    return { allocation, hasTechnicalTie: result.warnings.length > 0 }
  }, [department.seats, electorate, method, scenario.lists, votesByList])
  const projectionWarnings = useMemo(() => {
    const warnings = [...scenarioTotals.warnings]
    if (seatProjection.hasTechnicalTie) {
      warnings.push('Une égalité décisive est affichée dans un ordre technique : renseignez l’âge des candidats pour un résultat juridique.')
    }
    return warnings
  }, [scenarioTotals.warnings, seatProjection.hasTechnicalTie])
  const results: DisplayResult[] = useMemo(
    () => scenario.lists
      .map((list) => ({ list, votes: votesByList[list.id] ?? 0, seats: seatProjection.allocation[list.id] ?? 0 }))
      .sort((left, right) => right.seats - left.seats || right.votes - left.votes),
    [scenario.lists, seatProjection.allocation, votesByList],
  )

  const communeProjectionFor = (feature: GeoFeature) => {
    const profile = profileFor(feature)
    const localVotes: Record<string, number> = Object.fromEntries(scenario.lists.map(({ id }) => [id, 0]))
    profile.groups.flatMap(({ electors }) => electors).forEach((elector) => {
      assignedListsFor(elector).forEach((listId) => {
        if (localVotes[listId] !== undefined) localVotes[listId] += 1
      })
    })
    Object.entries(scenario.extraAssignments[profile.code] ?? {}).forEach(([listId, votes]) => {
      if (localVotes[listId] !== undefined) localVotes[listId] += votes
    })
    const extraState = calculateExtraDelegateState<Nuance>({
      profile,
      listIds: scenario.lists.map(({ id }) => id),
      bulkRules: scenario.bulkRules,
      electorAssignments: scenario.electorAssignments,
      extraAssignments: scenario.extraAssignments[profile.code] ?? {},
      maxVotesPerElector: maxVotesPerElector as 1 | 2,
    })
    Object.entries(extraState.bulkVotesByList).forEach(([listId, votes]) => {
      if (localVotes[listId] !== undefined) localVotes[listId] += votes
    })
    const dominance = getCommuneDominance(
      profile.code,
      scenario.lists.map(({ id }) => ({ contenderId: id, votes: localVotes[id] ?? 0 })),
    )
    const leader = scenario.lists.find(({ id }) => id === dominance.contenderId)
    return { dominance, leader }
  }

  const fillFor = (feature: GeoFeature) => {
    const { leader } = communeProjectionFor(feature)
    return leader ? NUANCE_COLORS[leader.nuance] : '#deded9'
  }

  const communeStatusFor = (feature: GeoFeature) => {
    const { dominance, leader } = communeProjectionFor(feature)
    if (!leader) return 'Aucune voix affectée.'
    if (dominance.tiedContenderIds.length > 1) {
      const tiedNames = dominance.tiedContenderIds
        .map((id) => scenario.lists.find((list) => list.id === id)?.shortName)
        .filter(Boolean)
        .join(', ')
      return `Égalité en tête entre ${tiedNames}, ${dominance.votes} voix chacune.`
    }
    return `${method === 'majority' ? 'Candidature' : 'Liste'} dominante : ${leader.shortName}, ${dominance.votes} voix.`
  }

  const toggleElector = (elector: Elector) => {
    if (!activeListId) return
    const current = assignedListsFor(elector)
    const next = current.includes(activeListId)
      ? current.filter((listId) => listId !== activeListId)
      : method === 'proportional'
        ? [activeListId]
        : [...current.slice(0, Math.max(0, maxVotesPerElector - 1)), activeListId]
    onUpdateScenario((stored) => ({
      ...stored,
      electorAssignments: { ...stored.electorAssignments, [elector.id]: next },
      electorNuances: { ...stored.electorNuances, [elector.id]: assignmentNuanceFor(elector) },
    }))
  }

  const assignGroup = (group: MunicipalGroup) => {
    if (!activeListId) return
    const allAssigned = group.electors.every((elector) => assignedListsFor(elector).includes(activeListId))
    onUpdateScenario((stored) => {
      const assignments = { ...stored.electorAssignments }
      const nuances = { ...stored.electorNuances }
      group.electors.forEach((elector) => {
        const current = assignedListsFor(elector)
        assignments[elector.id] = allAssigned
          ? current.filter((listId) => listId !== activeListId)
          : current.includes(activeListId)
            ? [...current]
            : method === 'proportional'
              ? [activeListId]
              : [...current.slice(0, Math.max(0, maxVotesPerElector - 1)), activeListId]
        nuances[elector.id] = assignmentNuanceFor(elector)
      })
      return { ...stored, electorAssignments: assignments, electorNuances: nuances }
    })
  }

  const setExtra = (listId: string, requestedVotes: number) => {
    if (!selectedProfile) return
    const current = scenario.extraAssignments[selectedProfile.code] ?? {}
    const otherVotes = Object.entries(current).reduce(
      (sum, [id, votes]) => sum + (id === listId ? 0 : votes),
      0,
    )
    const capacity = selectedProfile.extraDelegates * maxVotesPerElector
    const nextVotes = Math.max(
      0,
      Math.min(
        Number.isFinite(requestedVotes) ? Math.round(requestedVotes) : 0,
        selectedProfile.extraDelegates,
        capacity - otherVotes,
      ),
    )
    onUpdateScenario((stored) => ({
      ...stored,
      extraAssignments: {
        ...stored.extraAssignments,
        [selectedProfile.code]: { ...current, [listId]: nextVotes },
      },
      extraNuances: {
        ...(stored.extraNuances ?? {}),
        [selectedProfile.code]: selectedProfile.mayorNuance,
      },
      extraDelegateCounts: {
        ...(stored.extraDelegateCounts ?? {}),
        [selectedProfile.code]: selectedProfile.extraDelegates,
      },
    }))
  }

  const selectedExtraState = selectedProfile
    ? calculateExtraDelegateState<Nuance>({
        profile: selectedProfile,
        listIds: scenario.lists.map(({ id }) => id),
        bulkRules: scenario.bulkRules,
        electorAssignments: scenario.electorAssignments,
        extraAssignments: scenario.extraAssignments[selectedProfile.code] ?? {},
        maxVotesPerElector: maxVotesPerElector as 1 | 2,
      })
    : null

  const resetScenario = () => {
    onUpdateScenario(() => emptyScenario(department, method))
    setActiveListId(null)
    setSelectedProfile(null)
    setCoverageOpen(false)
    setReturnToCoverage(false)
    setResetNotice(true)
    window.setTimeout(() => setResetNotice(false), 2800)
  }

  const exportScenario = () => {
    downloadJSON(`senatoriales-2026-${code}-scenario-agrege.json`, {
      version: 2,
      exportedAt: new Date().toISOString(),
      department: { code, name: department.name, seats: department.seats, method },
      warning: 'Hypothèses de simulation agrégées, ne représentant pas des intentions de vote réelles.',
      projectionMode: method === 'majority' ? 'tour-decisif-majorite-relative' : 'plus-forte-moyenne',
      lists: scenario.lists,
      bulkRules: scenario.bulkRules,
      extraAssignments: scenario.extraAssignments,
      calculationWarnings: projectionWarnings,
      projection: results.map(({ list, votes, seats }) => ({ listId: list.id, name: list.name, votes, seats })),
    })
  }

  return (
    <main className="department-main">
      <div className="department-topline">
        <nav aria-label="Navigation du département">
          <button
            className="back-to-map-button"
            type="button"
            onClick={onBack}
            aria-label="Retour à la carte des départements"
          >
            <ArrowLeft aria-hidden="true" size={16} /> Retour à la carte
          </button>
          <ChevronRight aria-hidden="true" size={14} />
          <span aria-current="page">{department.name}</span>
        </nav>
        <div className="department-actions">
          <button type="button" onClick={onSources}><ShieldCheck size={15} /> Données</button>
          <button type="button" onClick={exportScenario}><Download size={15} /> Export agrégé</button>
          <button type="button" onClick={resetScenario}><RotateCcw size={15} /> Réinitialiser</button>
        </div>
      </div>

      <section className="department-hero">
        <div className="department-identity"><span>{code}</span><div><p className="eyebrow">Élections sénatoriales 2026</p><h1>{department.name}</h1></div></div>
        <div className="department-facts">
          <div><small>Sièges</small><strong>{department.seats}</strong></div>
          <div><small>Mode de scrutin</small><strong>{method === 'proportional' ? 'Proportionnelle' : 'Majoritaire'}</strong><span>{method === 'proportional' ? '1 tour · plus forte moyenne' : '2 tours · vote nominatif'}</span></div>
          <div><small>Collège utilisé</small><strong>{electorate.toLocaleString('fr-FR')}</strong><span>{department.officialElectors ? 'recensement provisoire au 23 juin' : 'volume de démonstration'}</span></div>
        </div>
        <button className="bulk-button" type="button" onClick={() => setBulkOpen(true)}><SlidersHorizontal size={17} /><span><strong>Affecter par nuance</strong><small>Présélection départementale</small></span></button>
      </section>

      <div className={`data-quality-banner ${municipalData.mode === 'source' ? '' : 'warning'}`}>
        <Database size={17} />
        {municipalData.mode === 'source' ? (
          <p><strong>Conseils municipaux réels chargés.</strong> {municipalData.communes.length.toLocaleString('fr-FR')} communes issues du RNE au 5 août 2026 ; listes d’élection rapprochées des résultats de mars. Sous 9 000 habitants, la désignation nominative des grands électeurs reste à confirmer par les tableaux préfectoraux.</p>
        ) : (
          <p><strong>Mode de secours.</strong> {municipalData.fallback.message} Les profils affichés pour ce département restent des données de démonstration.</p>
        )}
      </div>

      {method === 'majority' && (
        <div className="legal-mode-banner"><Vote size={17} /><p><strong>Vote nominatif et panachage.</strong> Chaque grand électeur peut soutenir jusqu’à {department.seats} candidatures. La projection classe le tour décisif à la majorité relative, dans l’hypothèse où aucun siège n’a été pourvu au premier tour.</p></div>
      )}

      <div className="simulator-grid">
        <ListsPanel lists={scenario.lists} method={method} activeListId={activeListId} onSelect={setActiveListId} onAdd={() => setAddListOpen(true)} />
        <DepartmentMap
          departmentCode={code}
          method={method}
          activeListName={activeList?.name ?? null}
          selectedCommuneCode={selectedProfile?.code ?? null}
          fillFor={fillFor}
          statusFor={communeStatusFor}
          onSelectCommune={(feature) => {
            setReturnToCoverage(false)
            setSelectedProfile(profileFor(feature))
          }}
        />
        <ResultsPanel
          results={results}
          totalVotes={totalVotes}
          assignedElectors={assignedElectors}
          electorate={electorate}
          seats={department.seats}
          method={method}
          warnings={projectionWarnings}
          onOpenCoverage={() => setCoverageOpen(true)}
        />
      </div>

      {selectedProfile && (
        <CommuneSheet
          profile={selectedProfile}
          lists={scenario.lists}
          activeListId={activeListId}
          method={method}
          seats={department.seats}
          extraAssignments={scenario.extraAssignments[selectedProfile.code] ?? {}}
          extraDelegatePoolByNuance={selectedExtraState?.poolByNuance ?? {}}
          extraBulkVotesByList={selectedExtraState?.bulkVotesByList ?? {}}
          assignedListsFor={assignedListsFor}
          assignmentSourceFor={(elector) => effectiveAssignmentFor(elector).source}
          onToggleElector={toggleElector}
          onAssignGroup={assignGroup}
          onSetExtra={setExtra}
          onClose={() => {
            setSelectedProfile(null)
            if (returnToCoverage) setCoverageOpen(true)
            setReturnToCoverage(false)
          }}
        />
      )}
      {coverageOpen && (
        <CoverageModal
          communes={communeCoverages}
          lists={scenario.lists}
          activeListId={activeListId}
          method={method}
          assignedElectors={assignedElectors}
          electorate={electorate}
          unlocatedTotal={unlocatedElectors}
          unlocatedAssigned={assignedUnlocatedElectors}
          onSelectList={setActiveListId}
          onOpenCommune={(coverage) => {
            setCoverageOpen(false)
            setReturnToCoverage(true)
            setSelectedProfile(coverage.profile)
          }}
          onOpenBulk={() => {
            setCoverageOpen(false)
            setBulkOpen(true)
          }}
          onClose={() => setCoverageOpen(false)}
        />
      )}
      {bulkOpen && (
        <BulkAssignmentModal
          lists={scenario.lists}
          method={method}
          electorateByNuance={electorateByNuance}
          extraDelegatesByNuance={extraDelegatesByNuance}
          includesSupplementaryDelegates={municipalData.mode === 'source'}
          rules={scenario.bulkRules}
          onChange={(nuance, rule: BulkRule) => onUpdateScenario((stored) => ({ ...stored, bulkRules: { ...stored.bulkRules, [nuance]: rule } }))}
          onReset={() => onUpdateScenario((stored) => ({ ...stored, bulkRules: {} }))}
          onClose={() => setBulkOpen(false)}
        />
      )}
      {addListOpen && (
        <AddListModal
          method={method}
          onAdd={(list) => {
            onUpdateScenario((stored) => ({ ...stored, lists: [...stored.lists, list] }))
            setActiveListId(list.id)
            setAddListOpen(false)
          }}
          onClose={() => setAddListOpen(false)}
        />
      )}
      {resetNotice && <div className="toast" role="status">Le scénario a été réinitialisé.</div>}
    </main>
  )
}

interface DepartmentRouteProps extends Omit<DepartmentScreenProps, 'municipalData'> {}

function DepartmentRoute(props: DepartmentRouteProps) {
  const [municipalData, setMunicipalData] = useState<MunicipalDepartmentData | null>(null)

  useEffect(() => {
    let cancelled = false
    setMunicipalData(null)
    void loadMunicipalData(props.code).then((data) => {
      if (!cancelled) setMunicipalData(data)
    })
    return () => {
      cancelled = true
    }
  }, [props.code])

  if (!municipalData) {
    return (
      <main className="department-main">
        <div className="department-data-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          <div><strong>Chargement des conseils municipaux</strong><span>Un seul fichier départemental est chargé à la demande.</span></div>
        </div>
      </main>
    )
  }

  return <DepartmentScreen {...props} municipalData={municipalData} />
}

export default function App() {
  const [departmentCode, setDepartmentCode] = useState<string | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null)
  const [scenarios, setScenarios] = useStoredState<ScenarioStore>('senatoriales-2026-scenarios-v2', {})

  useEffect(() => {
    setScenarios((current) => {
      let migrated = current
      Object.entries(current).forEach(([code, scenario]) => {
        const department = DEPARTMENT_BY_CODE.get(code)
        if (!department) return
        const nextScenario = mergeAnnouncedListsIntoScenario(
          scenario,
          code,
          votingMethodFor(department.seats),
        )
        if (nextScenario !== scenario) {
          if (migrated === current) migrated = { ...current }
          migrated[code] = nextScenario
        }
      })
      return migrated
    })
  }, [setScenarios])

  const openDepartment = (code: string) => {
    const department = DEPARTMENT_BY_CODE.get(code)
    if (!department) return
    setScenarios((current) => {
      const existing = current[code]
      const base = existing ?? emptyScenario(department, votingMethodFor(department.seats))
      const nextScenario = mergeAnnouncedListsIntoScenario(
        base,
        code,
        votingMethodFor(department.seats),
      )
      return existing === nextScenario ? current : { ...current, [code]: nextScenario }
    })
    setDepartmentCode(code)
    window.scrollTo({ top: 0 })
  }

  const currentDepartment = departmentCode ? DEPARTMENT_BY_CODE.get(departmentCode) : null
  const currentScenario = currentDepartment && departmentCode
    ? scenarios[departmentCode] ?? emptyScenario(currentDepartment, votingMethodFor(currentDepartment.seats))
    : null

  const mapProjections = useMemo(() => {
    const summaries: Record<string, DepartmentProjectionSummary | undefined> = {}
    Object.entries(scenarios).forEach(([code, scenario]) => {
      const projection = scenario.projectionSummary
      if (!projection) return
      const leader = scenario.lists.find(({ id }) => id === projection.leaderListId)
      if (
        !leader ||
        leader.nuance !== projection.leaderNuance ||
        !Object.prototype.hasOwnProperty.call(NUANCE_COLORS, projection.leaderNuance)
      ) return
      summaries[code] = projection
    })
    return summaries
  }, [scenarios])

  const canResetProjection = useMemo(
    () => Object.values(scenarios).some((scenario) =>
      Boolean(scenario.projectionSummary) ||
      Object.keys(scenario.electorAssignments).length > 0 ||
      Object.values(scenario.extraAssignments).some((assignments) =>
        Object.values(assignments).some((votes) => votes > 0),
      ) ||
      Object.values(scenario.bulkRules).some((rule) =>
        bulkAllocationsFor(rule).some(({ percentage }) => percentage > 0),
      ),
    ),
    [scenarios],
  )

  const resetNationalProjection = () => {
    setScenarios((current) => Object.fromEntries(
      Object.entries(current).map(([code, scenario]) => [
        code,
        {
          ...scenario,
          bulkRules: {},
          electorAssignments: {},
          electorNuances: {},
          extraAssignments: {},
          extraNuances: {},
          extraDelegateCounts: {},
          projectionSummary: undefined,
        },
      ]),
    ))
  }

  const returnToMap = () => {
    setDepartmentCode(null)
    window.scrollTo({ top: 0 })
    window.setTimeout(() => document.getElementById('map-title')?.focus(), 0)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Aller au contenu</a>
      <AppHeader onSources={() => setSourcesOpen(true)} onHome={returnToMap} />
      <div id="main-content">
        {departmentCode && currentScenario ? (
          <DepartmentRoute
            key={departmentCode}
            code={departmentCode}
            scenario={currentScenario}
            onUpdateScenario={(update) => setScenarios((current) => {
              const previous = current[departmentCode] ?? currentScenario
              const next = update(previous)
              return next === previous ? current : { ...current, [departmentCode]: next }
            })}
            onBack={returnToMap}
            onSources={() => setSourcesOpen(true)}
          />
        ) : (
          <HomeScreen
            onSelectDepartment={openDepartment}
            onSources={() => setSourcesOpen(true)}
            onResetProjection={resetNationalProjection}
            canResetProjection={canResetProjection}
            projections={mapProjections}
          />
        )}
      </div>
      <footer className="app-footer">
        <span>Développé par Edgar Cherrier · Hébergé sur Netlify</span>
        <nav aria-label="Informations légales">
          <button type="button" onClick={() => setLegalPage('legal')}>Mentions légales</button>
          <button type="button" onClick={() => setLegalPage('privacy')}>Politique de confidentialité</button>
        </nav>
        <span>Contours : data.gouv.fr / IGN–OSM · Règles : Sénat & Légifrance</span>
      </footer>
      {sourcesOpen && <SourcesModal onClose={() => setSourcesOpen(false)} />}
      {legalPage && (
        <LegalModal
          page={legalPage}
          onChangePage={setLegalPage}
          onClose={() => setLegalPage(null)}
        />
      )}
    </div>
  )
}
