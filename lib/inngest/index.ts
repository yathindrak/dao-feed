import { indexActiveProposals, updateActiveProposals } from './snapshot';
import { inngest, EVENTS } from './client';

export { inngest, EVENTS };

export const functions = {
  indexActiveProposals,
  updateActiveProposals,
} as const;
