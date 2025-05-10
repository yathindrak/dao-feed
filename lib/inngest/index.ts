import { indexActiveProposals, syncEndedProposalVotes } from './snapshot';
import { inngest } from './client';

export { inngest };

export const functions = {
  indexActiveProposals,
  syncEndedProposalVotes,
} as const;
