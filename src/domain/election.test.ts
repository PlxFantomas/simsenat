import { describe, expect, it } from "vitest";

import {
  allocateProportionalSeats,
  getCommuneDominance,
  runMajorityElection,
  sumVotes,
  tallyVotes,
} from "./election";

describe("vote totals", () => {
  it("aggregates duplicate vote blocks and keeps their first occurrence order", () => {
    const votes = [
      { contenderId: "B", votes: 2 },
      { contenderId: "A", votes: 3 },
      { contenderId: "B", votes: 4 },
    ];

    expect(tallyVotes(votes)).toEqual([
      { contenderId: "B", votes: 6 },
      { contenderId: "A", votes: 3 },
    ]);
    expect(sumVotes(votes)).toBe(9);
  });

  it("rejects fractional or negative vote counts", () => {
    expect(() => tallyVotes([{ contenderId: "A", votes: -1 }])).toThrow(RangeError);
    expect(() => tallyVotes([{ contenderId: "A", votes: 1.5 }])).toThrow(RangeError);
  });
});

describe("proportional allocation", () => {
  it("allocates seats using successive D'Hondt averages", () => {
    const result = allocateProportionalSeats(
      [
        { contenderId: "A", votes: 100 },
        { contenderId: "B", votes: 80 },
        { contenderId: "C", votes: 30 },
      ],
      { seatCount: 5 },
    );

    expect(result.allocations).toEqual([
      { contenderId: "A", votes: 100, seats: 3 },
      { contenderId: "B", votes: 80, seats: 2 },
      { contenderId: "C", votes: 30, seats: 0 },
    ]);
    expect(result.awards.map((award) => award.contenderId)).toEqual(["A", "B", "A", "B", "A"]);
    expect(result.vacantSeatCount).toBe(0);
  });

  it("uses raw votes, then configured order, for equal averages", () => {
    const rawVoteTie = allocateProportionalSeats(
      [
        { contenderId: "A", votes: 100 },
        { contenderId: "B", votes: 50 },
      ],
      { seatCount: 2, tieBreak: { order: ["B", "A"] } },
    );
    expect(rawVoteTie.awards.map((award) => award.contenderId)).toEqual(["A", "A"]);
    expect(rawVoteTie.awards[1].tieBreakMethod).toBe("higher-raw-votes");

    const configuredTie = allocateProportionalSeats(
      [
        { contenderId: "A", votes: 50 },
        { contenderId: "B", votes: 50 },
      ],
      { seatCount: 1, tieBreak: { order: ["B", "A"] } },
    );
    expect(configuredTie.awards[0]).toMatchObject({
      contenderId: "B",
      tieBreakMethod: "configured-order",
    });
    expect(configuredTie.warnings).toEqual([]);
  });

  it("uses a stable id fallback and reports that it is not an official tie-break", () => {
    const result = allocateProportionalSeats(
      [
        { contenderId: "B", votes: 10 },
        { contenderId: "A", votes: 10 },
      ],
      { seatCount: 1 },
    );

    expect(result.awards[0]).toMatchObject({ contenderId: "A", tieBreakMethod: "identifier" });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe("technical-identifier-tie-break");
  });

  it("does not award seats when every contender has zero votes", () => {
    const result = allocateProportionalSeats([{ contenderId: "A", votes: 0 }], {
      seatCount: 3,
    });

    expect(result.allocatedSeatCount).toBe(0);
    expect(result.vacantSeatCount).toBe(3);
  });
});

describe("majority election", () => {
  it("uses direct plurality when configured for one round", () => {
    const result = runMajorityElection(
      [
        {
          round: 1,
          votes: [
            { contenderId: "A", votes: 40 },
            { contenderId: "B", votes: 35 },
            { contenderId: "C", votes: 25 },
          ],
          validBallots: 100,
          registeredVoters: 120,
        },
      ],
      { seatCount: 2, roundCount: 1 },
    );

    expect(result.elected.map((candidate) => candidate.contenderId)).toEqual(["A", "B"]);
    expect(result.status).toBe("complete");
  });

  it("limits one-round candidate votes to the ballot capacity of the seats at issue", () => {
    const round = {
      round: 1 as const,
      votes: [
        { contenderId: "A", votes: 100 },
        { contenderId: "B", votes: 100 },
        { contenderId: "C", votes: 1 },
      ],
      validBallots: 100,
      registeredVoters: 120,
    };

    expect(() =>
      runMajorityElection([round], { seatCount: 2, roundCount: 1 }),
    ).toThrow(/total candidate votes/);
  });

  it("allows first-round candidate votes up to one choice per seat and ballot", () => {
    expect(() =>
      runMajorityElection(
        [
          {
            round: 1,
            votes: [
              { contenderId: "A", votes: 100 },
              { contenderId: "B", votes: 100 },
            ],
            validBallots: 100,
            registeredVoters: 120,
          },
        ],
        { seatCount: 2, roundCount: 2 },
      ),
    ).not.toThrow();
  });

  it("requires an absolute majority of valid ballots and a quarter of registered voters at T1", () => {
    const result = runMajorityElection(
      [
        {
          round: 1,
          votes: [
            { contenderId: "A", votes: 51 },
            { contenderId: "B", votes: 50 },
          ],
          validBallots: 100,
          registeredVoters: 204,
        },
      ],
      { seatCount: 2, roundCount: 2 },
    );

    expect(result.firstRoundThresholds).toEqual({
      minimumValidBallotVotes: 51,
      minimumRegisteredVoterVotes: 51,
    });
    expect(result.elected.map((candidate) => candidate.contenderId)).toEqual(["A"]);
    expect(result.remainingSeatCount).toBe(1);
    expect(result.status).toBe("awaiting-second-round");
  });

  it("fills only the remaining seats by relative majority at T2", () => {
    const result = runMajorityElection(
      [
        {
          round: 1,
          votes: [
            { contenderId: "A", votes: 60 },
            { contenderId: "B", votes: 45 },
            { contenderId: "C", votes: 30 },
          ],
          validBallots: 100,
          registeredVoters: 180,
        },
        {
          round: 2,
          votes: [
            { contenderId: "B", votes: 49 },
            { contenderId: "C", votes: 51 },
          ],
          validBallots: 100,
          registeredVoters: 180,
        },
      ],
      { seatCount: 2, roundCount: 2 },
    );

    expect(result.elected).toEqual([
      { contenderId: "A", votes: 60, round: 1 },
      { contenderId: "C", votes: 51, round: 2 },
    ]);
    expect(result.status).toBe("complete");
  });

  it("limits T2 candidate votes to the seats remaining after T1", () => {
    expect(() =>
      runMajorityElection(
        [
          {
            round: 1,
            votes: [
              { contenderId: "A", votes: 60 },
              { contenderId: "B", votes: 40 },
            ],
            validBallots: 100,
            registeredVoters: 180,
          },
          {
            round: 2,
            votes: [
              { contenderId: "B", votes: 60 },
              { contenderId: "C", votes: 41 },
            ],
            validBallots: 100,
            registeredVoters: 180,
          },
        ],
        { seatCount: 2, roundCount: 2 },
      ),
    ).toThrow(/round 2 total candidate votes/);
  });

  it("keeps the per-candidate valid-ballot limit", () => {
    expect(() =>
      runMajorityElection(
        [
          {
            round: 1,
            votes: [{ contenderId: "A", votes: 101 }],
            validBallots: 100,
            registeredVoters: 120,
          },
        ],
        { seatCount: 2, roundCount: 1 },
      ),
    ).toThrow(/votes for A cannot exceed validBallots/);
  });

  it("resolves a T2 equality with the configured statutory order", () => {
    const result = runMajorityElection(
      [
        {
          round: 1,
          votes: [
            { contenderId: "A", votes: 40 },
            { contenderId: "B", votes: 40 },
          ],
          validBallots: 100,
          registeredVoters: 100,
        },
        {
          round: 2,
          votes: [
            { contenderId: "A", votes: 50 },
            { contenderId: "B", votes: 50 },
          ],
          validBallots: 100,
          registeredVoters: 100,
        },
      ],
      { seatCount: 1, roundCount: 2, tieBreak: { order: ["B", "A"] } },
    );

    expect(result.elected).toEqual([
      { contenderId: "B", votes: 50, round: 2, tieBreakMethod: "configured-order" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("supports custom first-round thresholds", () => {
    const result = runMajorityElection(
      [
        {
          round: 1,
          votes: [{ contenderId: "A", votes: 40 }],
          validBallots: 100,
          registeredVoters: 100,
        },
      ],
      {
        seatCount: 1,
        roundCount: 2,
        firstRound: {
          validBallotShare: 0.4,
          validBallotComparison: "at-least",
          registeredVoterShare: 0.3,
        },
      },
    );

    expect(result.elected.map((candidate) => candidate.contenderId)).toEqual(["A"]);
  });
});

describe("commune dominance", () => {
  it("returns the leading contender and total assigned votes", () => {
    expect(
      getCommuneDominance("75056", [
        { contenderId: "A", votes: 3 },
        { contenderId: "B", votes: 5 },
        { contenderId: "A", votes: 1 },
      ]),
    ).toEqual({
      communeCode: "75056",
      contenderId: "B",
      votes: 5,
      totalVotes: 9,
      tiedContenderIds: ["B"],
    });
  });

  it("makes a tied commune deterministic and exposes the tie", () => {
    expect(
      getCommuneDominance(
        "01001",
        [
          { contenderId: "A", votes: 4 },
          { contenderId: "B", votes: 4 },
        ],
        { order: ["B", "A"] },
      ),
    ).toEqual({
      communeCode: "01001",
      contenderId: "B",
      votes: 4,
      totalVotes: 8,
      tiedContenderIds: ["A", "B"],
      tieBreakMethod: "configured-order",
    });
  });

  it("has no dominant contender when no positive vote is assigned", () => {
    expect(getCommuneDominance("01001", [{ contenderId: "A", votes: 0 }])).toEqual({
      communeCode: "01001",
      contenderId: null,
      votes: 0,
      totalVotes: 0,
      tiedContenderIds: [],
    });
  });
});
