import { indexProposals, indexSpaces, indexVotesAndUsers } from './snapshot';
import { inngest, EVENTS } from './client';

export { inngest, EVENTS };

export const functions = {
  indexSpaces,
  indexProposals,
  indexVotesAndUsers,
} as const;
