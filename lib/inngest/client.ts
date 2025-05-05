import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'daofeed',
});

export const EVENTS = {
  SNAPSHOT: {
    INDEX_SPACES: 'snapshot/index.spaces',
    INDEX_PROPOSALS: 'snapshot/index.proposals',
    INDEX_VOTES: 'snapshot/index.votes',
  },
} as const;
