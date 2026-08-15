import type {
  CommuneCode,
  CommuneDominance,
  ContenderId,
  ElectionWarning,
  MajorityElectedCandidate,
  MajorityElectionResult,
  MajorityElectionRules,
  MajorityRoundInput,
  MajorityThresholds,
  ProportionalElectionResult,
  ProportionalElectionRules,
  ProportionalSeatAward,
  SeatAllocation,
  ShareComparison,
  TieBreakMethod,
  TieBreakRules,
  VoteEntry,
  VoteTally,
} from "./types";

const DEFAULT_VALID_BALLOT_SHARE = 0.5;
const DEFAULT_REGISTERED_VOTER_SHARE = 0.25;

interface RankedTally extends VoteTally {
  readonly firstSeenAt: number;
}

interface ComparisonResult {
  /** Negative means `left` must be ranked before `right`. */
  readonly order: number;
  readonly tieBreakMethod?: TieBreakMethod;
  readonly usedIdentifierFallback: boolean;
}

function assertNonEmptyId(contenderId: string): void {
  if (contenderId.trim().length === 0) {
    throw new TypeError("contenderId must be a non-empty string");
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function assertShare(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function makeTieBreakRanks(rules?: TieBreakRules): ReadonlyMap<ContenderId, number> {
  const ranks = new Map<ContenderId, number>();
  rules?.order?.forEach((contenderId, index) => {
    assertNonEmptyId(contenderId);
    if (!ranks.has(contenderId)) ranks.set(contenderId, index);
  });
  return ranks;
}

function compareConfiguredThenId(
  left: ContenderId,
  right: ContenderId,
  ranks: ReadonlyMap<ContenderId, number>,
): ComparisonResult {
  const leftRank = ranks.get(left);
  const rightRank = ranks.get(right);

  if (leftRank !== undefined || rightRank !== undefined) {
    const normalizedLeft = leftRank ?? Number.POSITIVE_INFINITY;
    const normalizedRight = rightRank ?? Number.POSITIVE_INFINITY;
    if (normalizedLeft !== normalizedRight) {
      return {
        order: normalizedLeft - normalizedRight,
        tieBreakMethod: "configured-order",
        usedIdentifierFallback: false,
      };
    }
  }

  return {
    order: compareIds(left, right),
    tieBreakMethod: "identifier",
    usedIdentifierFallback: true,
  };
}

function technicalTieWarning(
  contenderIds: readonly ContenderId[],
  detail: { readonly round?: 1 | 2; readonly seatNumber?: number } = {},
): ElectionWarning {
  return {
    code: "technical-identifier-tie-break",
    message:
      "Equality could not be resolved from the configured statutory order; a stable identifier order was used and must not be treated as an official result.",
    contenderIds: [...contenderIds].sort(compareIds),
    ...detail,
  };
}

/** Aggregates vote blocks while preserving the first occurrence order. */
export function tallyVotes(entries: readonly VoteEntry[]): VoteTally[] {
  const tallies = new Map<ContenderId, RankedTally>();

  entries.forEach((entry, index) => {
    assertNonEmptyId(entry.contenderId);
    assertCount(entry.votes, `votes for ${entry.contenderId}`);
    const current = tallies.get(entry.contenderId);
    const votes = (current?.votes ?? 0) + entry.votes;
    assertCount(votes, `total votes for ${entry.contenderId}`);
    tallies.set(entry.contenderId, {
      contenderId: entry.contenderId,
      votes,
      firstSeenAt: current?.firstSeenAt ?? index,
    });
  });

  return [...tallies.values()]
    .sort((left, right) => left.firstSeenAt - right.firstSeenAt)
    .map(({ contenderId, votes }) => ({ contenderId, votes }));
}

/** Returns the sum of all vote blocks, before aggregation by contender. */
export function sumVotes(entries: readonly VoteEntry[]): number {
  return tallyVotes(entries).reduce((total, entry) => {
    const next = total + entry.votes;
    assertCount(next, "total votes");
    return next;
  }, 0);
}

function sortAllocations(
  allocations: readonly SeatAllocation[],
  tieBreakRanks: ReadonlyMap<ContenderId, number>,
): SeatAllocation[] {
  return [...allocations].sort((left, right) => {
    if (left.seats !== right.seats) return right.seats - left.seats;
    if (left.votes !== right.votes) return right.votes - left.votes;
    return compareConfiguredThenId(left.contenderId, right.contenderId, tieBreakRanks).order;
  });
}

/**
 * Allocates seats by successive D'Hondt averages. Quotients are compared by
 * integer cross-products to avoid floating-point tie errors.
 */
export function allocateProportionalSeats(
  entries: readonly VoteEntry[],
  rules: ProportionalElectionRules,
): ProportionalElectionResult {
  assertPositiveCount(rules.seatCount, "seatCount");
  const tallies = tallyVotes(entries);
  const totalVotes = sumVotes(tallies);
  const tieBreakRanks = makeTieBreakRanks(rules.tieBreak);
  const seatCounts = new Map<ContenderId, number>(
    tallies.map((tally) => [tally.contenderId, 0]),
  );
  const awards: ProportionalSeatAward[] = [];
  const warnings: ElectionWarning[] = [];

  const eligible = tallies.filter((tally) => tally.votes > 0);
  for (let seatNumber = 1; seatNumber <= rules.seatCount && eligible.length > 0; seatNumber += 1) {
    let winner = eligible[0];
    let winnerTieBreakMethod: TieBreakMethod | undefined;
    let identifierTieIds: ContenderId[] | undefined;

    for (let index = 1; index < eligible.length; index += 1) {
      const challenger = eligible[index];
      const winnerDivisor = (seatCounts.get(winner.contenderId) ?? 0) + 1;
      const challengerDivisor = (seatCounts.get(challenger.contenderId) ?? 0) + 1;
      const leftProduct = challenger.votes * winnerDivisor;
      const rightProduct = winner.votes * challengerDivisor;

      if (!Number.isSafeInteger(leftProduct) || !Number.isSafeInteger(rightProduct)) {
        throw new RangeError("D'Hondt quotient comparison exceeds safe integer precision");
      }

      if (leftProduct > rightProduct) {
        winner = challenger;
        winnerTieBreakMethod = undefined;
        identifierTieIds = undefined;
        continue;
      }
      if (leftProduct < rightProduct) continue;

      let comparison: ComparisonResult;
      if (challenger.votes !== winner.votes) {
        comparison = {
          order: challenger.votes > winner.votes ? -1 : 1,
          tieBreakMethod: "higher-raw-votes",
          usedIdentifierFallback: false,
        };
      } else {
        comparison = compareConfiguredThenId(
          challenger.contenderId,
          winner.contenderId,
          tieBreakRanks,
        );
      }

      if (comparison.order < 0) {
        const previousWinner = winner;
        winner = challenger;
        winnerTieBreakMethod = comparison.tieBreakMethod;
        identifierTieIds = comparison.usedIdentifierFallback
          ? [challenger.contenderId, previousWinner.contenderId]
          : undefined;
      } else {
        winnerTieBreakMethod = comparison.tieBreakMethod;
        identifierTieIds = comparison.usedIdentifierFallback
          ? [winner.contenderId, challenger.contenderId]
          : undefined;
      }
    }

    const previousSeats = seatCounts.get(winner.contenderId) ?? 0;
    const denominator = previousSeats + 1;
    seatCounts.set(winner.contenderId, previousSeats + 1);
    awards.push({
      seatNumber,
      contenderId: winner.contenderId,
      quotientNumerator: winner.votes,
      quotientDenominator: denominator,
      average: winner.votes / denominator,
      tieBreakMethod: winnerTieBreakMethod,
    });
    if (identifierTieIds) {
      warnings.push(technicalTieWarning(identifierTieIds, { seatNumber }));
    }
  }

  const allocations = sortAllocations(
    tallies.map((tally) => ({
      ...tally,
      seats: seatCounts.get(tally.contenderId) ?? 0,
    })),
    tieBreakRanks,
  );

  return {
    method: "proportional",
    seatCount: rules.seatCount,
    allocatedSeatCount: awards.length,
    vacantSeatCount: rules.seatCount - awards.length,
    totalVotes,
    allocations,
    awards,
    warnings,
  };
}

function minimumVotes(total: number, share: number, comparison: ShareComparison): number {
  const exact = total * share;
  return comparison === "strictly-greater" ? Math.floor(exact) + 1 : Math.ceil(exact);
}

function firstRoundThresholds(
  round: MajorityRoundInput,
  rules: MajorityElectionRules,
): MajorityThresholds {
  const validShare = rules.firstRound?.validBallotShare ?? DEFAULT_VALID_BALLOT_SHARE;
  const registeredShare =
    rules.firstRound?.registeredVoterShare ?? DEFAULT_REGISTERED_VOTER_SHARE;
  const validComparison =
    rules.firstRound?.validBallotComparison ?? "strictly-greater";
  const registeredComparison =
    rules.firstRound?.registeredVoterComparison ?? "at-least";
  assertShare(validShare, "first-round validBallotShare");
  assertShare(registeredShare, "first-round registeredVoterShare");

  return {
    minimumValidBallotVotes: minimumVotes(round.validBallots, validShare, validComparison),
    minimumRegisteredVoterVotes: minimumVotes(
      round.registeredVoters,
      registeredShare,
      registeredComparison,
    ),
  };
}

function validateMajorityRound(
  round: MajorityRoundInput,
  seatsAtIssue: number,
): VoteTally[] {
  assertPositiveCount(seatsAtIssue, `round ${round.round} seatsAtIssue`);
  assertCount(round.validBallots, `round ${round.round} validBallots`);
  assertCount(round.registeredVoters, `round ${round.round} registeredVoters`);
  if (round.validBallots > round.registeredVoters) {
    throw new RangeError(`round ${round.round} validBallots cannot exceed registeredVoters`);
  }
  const tallies = tallyVotes(round.votes);
  for (const tally of tallies) {
    if (tally.votes > round.validBallots) {
      throw new RangeError(
        `round ${round.round} votes for ${tally.contenderId} cannot exceed validBallots`,
      );
    }
  }
  const maximumCandidateVotes = round.validBallots * seatsAtIssue;
  if (!Number.isSafeInteger(maximumCandidateVotes)) {
    throw new RangeError(`round ${round.round} vote capacity exceeds safe integer precision`);
  }
  if (sumVotes(tallies) > maximumCandidateVotes) {
    throw new RangeError(
      `round ${round.round} total candidate votes cannot exceed validBallots multiplied by seatsAtIssue`,
    );
  }
  return tallies;
}

function rankMajorityTallies(
  tallies: readonly VoteTally[],
  tieBreakRanks: ReadonlyMap<ContenderId, number>,
): Array<{ tally: VoteTally; tieBreakMethod?: TieBreakMethod; identifierTieIds?: ContenderId[] }> {
  const sorted = [...tallies].sort((left, right) => {
    if (left.votes !== right.votes) return right.votes - left.votes;
    return compareConfiguredThenId(left.contenderId, right.contenderId, tieBreakRanks).order;
  });

  return sorted.map((tally, index) => {
    const peers = sorted.filter((candidate) => candidate.votes === tally.votes);
    if (peers.length < 2) return { tally };
    const comparison = compareConfiguredThenId(
      tally.contenderId,
      peers.find((peer) => peer.contenderId !== tally.contenderId)!.contenderId,
      tieBreakRanks,
    );
    return {
      tally,
      tieBreakMethod: comparison.tieBreakMethod,
      identifierTieIds: comparison.usedIdentifierFallback
        ? peers.map((peer) => peer.contenderId)
        : undefined,
    };
  });
}

function selectPluralityWinners(
  tallies: readonly VoteTally[],
  seatCount: number,
  round: 1 | 2,
  tieBreakRanks: ReadonlyMap<ContenderId, number>,
  warnings: ElectionWarning[],
): MajorityElectedCandidate[] {
  const ranked = rankMajorityTallies(
    tallies.filter((tally) => tally.votes > 0),
    tieBreakRanks,
  );
  const selected = ranked.slice(0, seatCount);
  const cutoffWinner = selected.at(-1);
  const firstNotElected = ranked[selected.length];
  if (
    cutoffWinner?.identifierTieIds &&
    firstNotElected?.tally.votes === cutoffWinner.tally.votes
  ) {
    warnings.push(technicalTieWarning(cutoffWinner.identifierTieIds, { round }));
  }
  return selected.map(({ tally, tieBreakMethod }) => ({
    ...tally,
    round,
    tieBreakMethod,
  }));
}

/**
 * Runs a one-round plurality election or the French senatorial two-round
 * majority rules. In a two-seat election `validBallots` remains the ballot
 * count: candidate vote totals may sum above it because panachage is allowed.
 */
export function runMajorityElection(
  rounds: readonly MajorityRoundInput[],
  rules: MajorityElectionRules,
): MajorityElectionResult {
  if (rules.seatCount !== 1 && rules.seatCount !== 2) {
    throw new RangeError("seatCount must be 1 or 2 for a majority election");
  }
  if (rules.roundCount !== 1 && rules.roundCount !== 2) {
    throw new RangeError("roundCount must be 1 or 2");
  }

  const byRound = new Map<1 | 2, MajorityRoundInput>();
  for (const round of rounds) {
    if (round.round > rules.roundCount) {
      throw new RangeError(`round ${round.round} is not allowed by roundCount`);
    }
    if (byRound.has(round.round)) {
      throw new TypeError(`round ${round.round} was provided more than once`);
    }
    byRound.set(round.round, round);
  }
  const firstRound = byRound.get(1);
  if (!firstRound) throw new TypeError("round 1 is required");

  const tieBreakRanks = makeTieBreakRanks(rules.tieBreak);
  const warnings: ElectionWarning[] = [];
  const firstTallies = validateMajorityRound(firstRound, rules.seatCount);

  if (rules.roundCount === 1) {
    const elected = selectPluralityWinners(
      firstTallies,
      rules.seatCount,
      1,
      tieBreakRanks,
      warnings,
    );
    return {
      method: "majority",
      seatCount: rules.seatCount,
      elected,
      remainingSeatCount: rules.seatCount - elected.length,
      status: elected.length === rules.seatCount ? "complete" : "vacant-seats",
      warnings,
    };
  }

  const thresholds = firstRoundThresholds(firstRound, rules);
  const qualified = firstTallies.filter(
    (tally) =>
      tally.votes >= thresholds.minimumValidBallotVotes &&
      tally.votes >= thresholds.minimumRegisteredVoterVotes,
  );
  const firstRoundElected = selectPluralityWinners(
    qualified,
    rules.seatCount,
    1,
    tieBreakRanks,
    warnings,
  );
  const remainingAfterFirst = rules.seatCount - firstRoundElected.length;
  if (remainingAfterFirst === 0) {
    return {
      method: "majority",
      seatCount: rules.seatCount,
      elected: firstRoundElected,
      remainingSeatCount: 0,
      status: "complete",
      firstRoundThresholds: thresholds,
      warnings,
    };
  }

  const secondRound = byRound.get(2);
  if (!secondRound) {
    return {
      method: "majority",
      seatCount: rules.seatCount,
      elected: firstRoundElected,
      remainingSeatCount: remainingAfterFirst,
      status: "awaiting-second-round",
      firstRoundThresholds: thresholds,
      warnings,
    };
  }

  const alreadyElected = new Set(firstRoundElected.map((candidate) => candidate.contenderId));
  const secondTallies = validateMajorityRound(secondRound, remainingAfterFirst).filter(
    (tally) => !alreadyElected.has(tally.contenderId),
  );
  const secondRoundElected = selectPluralityWinners(
    secondTallies,
    remainingAfterFirst,
    2,
    tieBreakRanks,
    warnings,
  );
  const elected = [...firstRoundElected, ...secondRoundElected];
  const remainingSeatCount = rules.seatCount - elected.length;
  return {
    method: "majority",
    seatCount: rules.seatCount,
    elected,
    remainingSeatCount,
    status: remainingSeatCount === 0 ? "complete" : "vacant-seats",
    firstRoundThresholds: thresholds,
    warnings,
  };
}

/** Computes the list/candidate that determines a commune's map colour. */
export function getCommuneDominance(
  communeCode: CommuneCode,
  entries: readonly VoteEntry[],
  tieBreak?: TieBreakRules,
): CommuneDominance {
  if (communeCode.trim().length === 0) {
    throw new TypeError("communeCode must be a non-empty string");
  }
  const tallies = tallyVotes(entries);
  const totalVotes = sumVotes(tallies);
  if (tallies.length === 0 || tallies.every((tally) => tally.votes === 0)) {
    return {
      communeCode,
      contenderId: null,
      votes: 0,
      totalVotes,
      tiedContenderIds: [],
    };
  }

  const maxVotes = Math.max(...tallies.map((tally) => tally.votes));
  const tied = tallies
    .filter((tally) => tally.votes === maxVotes)
    .map((tally) => tally.contenderId);
  if (tied.length === 1) {
    return {
      communeCode,
      contenderId: tied[0],
      votes: maxVotes,
      totalVotes,
      tiedContenderIds: tied,
    };
  }

  const ranks = makeTieBreakRanks(tieBreak);
  const sorted = [...tied].sort(
    (left, right) => compareConfiguredThenId(left, right, ranks).order,
  );
  const comparison = compareConfiguredThenId(sorted[0], sorted[1], ranks);
  return {
    communeCode,
    contenderId: sorted[0],
    votes: maxVotes,
    totalVotes,
    tiedContenderIds: [...tied].sort(compareIds),
    tieBreakMethod:
      comparison.tieBreakMethod === "configured-order" ? "configured-order" : "identifier",
  };
}
