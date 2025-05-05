import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  email: varchar('email', { length: 64 }).notNull(),
  address: varchar('address', { length: 42 }).notNull(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: varchar('userId', { length: 255 })
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const snapshotSpace = pgTable('snapshot_space', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  name: text('name').notNull(),
  about: text('about'),
  network: varchar('network', { length: 50 }),
  symbol: varchar('symbol', { length: 50 }),
  strategies: json('strategies'),
  lastIndexedAt: timestamp('last_indexed_at').notNull(),
});

export type SnapshotSpace = InferSelectModel<typeof snapshotSpace>;

export const snapshotSpaceMember = pgTable(
  'snapshot_space_member',
  {
    spaceId: varchar('space_id', { length: 255 })
      .notNull()
      .references(() => snapshotSpace.id),
    memberId: varchar('member_id', { length: 255 })
      .notNull()
      .references(() => snapshotUser.id),
    addedAt: timestamp('added_at').notNull(),
    removedAt: timestamp('removed_at'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.spaceId, table.memberId] }),
    };
  },
);

export type SnapshotSpaceMember = InferSelectModel<typeof snapshotSpaceMember>;

export const snapshotProposal = pgTable('snapshot_proposal', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  spaceId: varchar('space_id', { length: 255 })
    .notNull()
    .references(() => snapshotSpace.id),
  title: text('title').notNull(),
  body: text('body'),
  choices: json('choices'),
  start: timestamp('start').notNull(),
  end: timestamp('end').notNull(),
  snapshot: varchar('snapshot', { length: 255 }),
  state: varchar('state', { length: 50 }),
  author: varchar('author', { length: 255 }),
  scores: json('scores'),
  scoresTotal: text('scores_total'),
  createdAt: timestamp('created_at').notNull(),
});

export type SnapshotProposal = InferSelectModel<typeof snapshotProposal>;

export const snapshotUser = pgTable('snapshot_user', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  name: text('name'),
  about: text('about'),
  avatar: text('avatar'),
  proposalsCount: json('proposals_count'),
  votesCount: json('votes_count'),
  farcaster: text('farcaster'),
  lastVote: varchar('last_vote', { length: 255 }),
  lens: text('lens'),
  twitter: text('twitter'),
  lastIndexedAt: timestamp('last_indexed_at').notNull(),
});

export type SnapshotUser = InferSelectModel<typeof snapshotUser>;

export const snapshotVote = pgTable('snapshot_vote', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  voter: varchar('voter', { length: 255 })
    .notNull()
    .references(() => snapshotUser.id),
  proposalId: varchar('proposal_id', { length: 255 })
    .notNull()
    .references(() => snapshotProposal.id),
  choice: json('choice').notNull(),
  created: timestamp('created').notNull(),
});

export type SnapshotVote = InferSelectModel<typeof snapshotVote>;

export const snapshotUserMonthlyActivity = pgTable(
  'snapshot_user_monthly_activity',
  {
    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => snapshotUser.id),
    year: varchar('year', { length: 4 }).notNull(),
    month: varchar('month', { length: 2 }).notNull(),
    proposalsCount: integer('proposals_count').notNull().default(0),
    votesCount: integer('votes_count').notNull().default(0),
    lastUpdatedAt: timestamp('last_updated_at').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.year, table.month] }),
    };
  },
);

export type SnapshotUserMonthlyActivity = InferSelectModel<
  typeof snapshotUserMonthlyActivity
>;
