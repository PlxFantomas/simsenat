export type DepartmentCode = string;
export type CommuneCode = string;
export type PersonId = string;
export type GroupId = string;
export type ListId = string;
export type CandidateId = string;
export type ContenderId = string;

export type PoliticalNuance =
  | "RN"
  | "UDR"
  | "LR"
  | "DVD"
  | "Renaissance"
  | "Horizons"
  | "Modem"
  | "DVC"
  | "PS"
  | "Ecologistes"
  | "PCF"
  | "LFI"
  | "Régionalistes"
  | "Divers/SE";

export interface Person {
  readonly id: PersonId;
  readonly fullName: string;
  readonly nuance?: PoliticalNuance;
  /** Free-form source label when it is more precise than `nuance`. */
  readonly politicalLabel?: string;
  /** ISO 8601 date, useful for statutory age-based tie-breaks. */
  readonly birthDate?: string;
}

export type CouncilGroupKind = "majority" | "opposition" | "non-inscrit";

export interface CouncilGroup {
  readonly id: GroupId;
  readonly name: string;
  readonly kind: CouncilGroupKind;
  readonly nuance?: PoliticalNuance;
  readonly politicalLabel?: string;
  readonly members: readonly Person[];
}

export type GrandElectorKind =
  | "municipal-councillor"
  | "additional-delegate"
  | "substitute"
  | "other";

export interface GrandElector extends Person {
  readonly communeCode: CommuneCode;
  readonly groupId?: GroupId;
  readonly kind: GrandElectorKind;
}

export interface Commune {
  readonly code: CommuneCode;
  readonly name: string;
  readonly departmentCode: DepartmentCode;
  readonly mayor: Person;
  readonly groups: readonly CouncilGroup[];
  readonly grandElectors: readonly GrandElector[];
  readonly grandElectorCount: number;
  readonly additionalDelegateCount: number;
}

export interface Candidate extends Person {
  readonly position?: number;
}

export interface SenatorialList {
  readonly id: ListId;
  readonly name: string;
  readonly departmentCode: DepartmentCode;
  readonly nuance: PoliticalNuance;
  readonly leadCandidateId?: CandidateId;
  readonly candidates: readonly Candidate[];
  readonly announcedAt?: string;
  readonly sourceUrl?: string;
}

export type SenatorialElectionMethod = "proportional" | "majority";

export interface DepartmentElection {
  readonly departmentCode: DepartmentCode;
  readonly departmentName: string;
  readonly renewed: boolean;
  readonly seatCount: number;
  readonly method: SenatorialElectionMethod;
  readonly lists: readonly SenatorialList[];
}

/** A vote block. Duplicate contender ids are allowed and are aggregated. */
export interface VoteEntry {
  readonly contenderId: ContenderId;
  readonly votes: number;
}

export interface VoteTally extends VoteEntry {}

/**
 * First id has the highest priority. For a legal result this order should be
 * built from the applicable age rule; the engine only uses ids as a final,
 * explicitly reported technical fallback.
 */
export interface TieBreakRules {
  readonly order?: readonly ContenderId[];
}

export type TieBreakMethod =
  | "higher-raw-votes"
  | "configured-order"
  | "identifier";

export type ElectionWarningCode = "technical-identifier-tie-break";

export interface ElectionWarning {
  readonly code: ElectionWarningCode;
  readonly message: string;
  readonly contenderIds: readonly ContenderId[];
  readonly round?: 1 | 2;
  readonly seatNumber?: number;
}

export interface ProportionalElectionRules {
  readonly seatCount: number;
  readonly tieBreak?: TieBreakRules;
}

export interface SeatAllocation extends VoteTally {
  readonly seats: number;
}

export interface ProportionalSeatAward {
  readonly seatNumber: number;
  readonly contenderId: ContenderId;
  readonly quotientNumerator: number;
  readonly quotientDenominator: number;
  readonly average: number;
  readonly tieBreakMethod?: TieBreakMethod;
}

export interface ProportionalElectionResult {
  readonly method: "proportional";
  readonly seatCount: number;
  readonly allocatedSeatCount: number;
  readonly vacantSeatCount: number;
  readonly totalVotes: number;
  readonly allocations: readonly SeatAllocation[];
  readonly awards: readonly ProportionalSeatAward[];
  readonly warnings: readonly ElectionWarning[];
}

export type ShareComparison = "strictly-greater" | "at-least";

export interface MajorityFirstRoundRules {
  /** Defaults to 0.5 with `strictly-greater`. */
  readonly validBallotShare?: number;
  readonly validBallotComparison?: ShareComparison;
  /** Defaults to 0.25 with `at-least`. */
  readonly registeredVoterShare?: number;
  readonly registeredVoterComparison?: ShareComparison;
}

export interface MajorityElectionRules {
  readonly seatCount: 1 | 2;
  /** One round means direct plurality. Two rounds enables T1 thresholds. */
  readonly roundCount: 1 | 2;
  readonly firstRound?: MajorityFirstRoundRules;
  readonly tieBreak?: TieBreakRules;
}

export interface MajorityRoundInput {
  readonly round: 1 | 2;
  readonly votes: readonly VoteEntry[];
  /** Number of valid ballot papers, not the sum of candidate votes. */
  readonly validBallots: number;
  readonly registeredVoters: number;
}

export interface MajorityThresholds {
  readonly minimumValidBallotVotes: number;
  readonly minimumRegisteredVoterVotes: number;
}

export interface MajorityElectedCandidate extends VoteTally {
  readonly round: 1 | 2;
  readonly tieBreakMethod?: TieBreakMethod;
}

export type MajorityElectionStatus =
  | "complete"
  | "awaiting-second-round"
  | "vacant-seats";

export interface MajorityElectionResult {
  readonly method: "majority";
  readonly seatCount: 1 | 2;
  readonly elected: readonly MajorityElectedCandidate[];
  readonly remainingSeatCount: number;
  readonly status: MajorityElectionStatus;
  readonly firstRoundThresholds?: MajorityThresholds;
  readonly warnings: readonly ElectionWarning[];
}

export interface CommuneVoteEntry extends VoteEntry {
  readonly communeCode: CommuneCode;
}

export interface CommuneDominance {
  readonly communeCode: CommuneCode;
  readonly contenderId: ContenderId | null;
  readonly votes: number;
  readonly totalVotes: number;
  readonly tiedContenderIds: readonly ContenderId[];
  readonly tieBreakMethod?: "configured-order" | "identifier";
}
