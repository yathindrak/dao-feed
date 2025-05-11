export type SnapshotProposal = {
  id: string;
  spaceId: string;
  title: string;
  body: string | null;
  choices: string[];
  start: string;
  end: string;
  snapshot: string | null;
  state: string;
  author: string;
  scores: number[];
  scoresTotal: string;
  createdAt: string;
  votesSynced: boolean;
};

export type ProposalsResult = {
  proposals: SnapshotProposal[];
};

export type CoverageResult = {
  percentage: number;
};
