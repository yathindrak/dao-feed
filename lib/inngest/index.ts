import {
  indexActiveProposals,
  syncEndedProposalVotes,
  snapshotUserMonthlyActivityJob,
} from './snapshot';
import { inngest } from './client';

export { inngest };

export const functions = {
  indexActiveProposals,
  syncEndedProposalVotes,
  snapshotUserMonthlyActivityJob,
} as const;
