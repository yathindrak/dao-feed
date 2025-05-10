import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'daofeed',
});

export const EVENTS = {
  SNAPSHOT: {
    // INDEX_PROPOSALS: 'snapshot/index.proposals',

    UPDATE_ACTIVE_PROPOSALS: 'snapshot/update.active.proposals',
  },
} as const;
