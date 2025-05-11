import type { z } from 'zod';
import { ActionProvider, CreateAction } from '@coinbase/agentkit';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  snapshotProposal,
  snapshotVote,
  snapshotUser,
  snapshotFollow,
  snapshotSpaceMember,
} from '@/lib/db/schema';
import { and, gte, lte, eq, inArray, not } from 'drizzle-orm';
import { GetProposalsSchema } from './schemas';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}
const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

export class SnapshotActionProvider extends ActionProvider<any> {
  private userAddress?: string;
  constructor(userAddress?: string) {
    super('snapshot', []);
    this.userAddress = userAddress;
  }

  supportsNetwork() {
    return true;
  }

  @CreateAction({
    name: 'get_created_proposals',
    description:
      'Retrieves proposals authored by a specific user.  The system can infer the user ID from context if not provided. The time range defaults to the current week if not specified',
    schema: GetProposalsSchema,
  })
  async getCreatedProposals(
    _: null,
    args?: z.infer<typeof GetProposalsSchema>,
  ) {
    const safeArgs = args ?? {};
    console.log('getCreatedProposals', safeArgs);
    let { userId, from, to } = safeArgs;
    if (!userId && this.userAddress) userId = this.userAddress;
    if (!userId) return JSON.stringify({ proposals: [] });
    const start = from ? new Date(from) : this.getStartOfWeek();
    const end = to ? new Date(to) : new Date();
    const proposals = await db
      .select()
      .from(snapshotProposal)
      .where(
        and(
          gte(snapshotProposal.createdAt, start),
          lte(snapshotProposal.createdAt, end),
          eq(snapshotProposal.author, userId),
        ),
      )
      .orderBy(snapshotProposal.createdAt);

    console.log({ proposals });
    return JSON.stringify({ proposals });
  }

  @CreateAction({
    name: 'get_new_unaddressed_proposals',
    description:
      "Get new proposals (e.g., for 'today' or 'this week') that the user has NOT yet voted on. The system can infer the user ID from context if not provided. The time range defaults to the current week if not specified. Results are grouped by spaces the user is following and spaces the user is a member of.",
    schema: GetProposalsSchema,
  })
  async getNewUnaddressedProposals(
    _: null,
    args?: z.infer<typeof GetProposalsSchema>,
  ) {
    console.log('getNewUnaddressedProposals', args);
    const safeArgs = args ?? {};
    let { userId, from, to } = safeArgs;
    if (!userId && this.userAddress) userId = this.userAddress;
    if (!userId) return JSON.stringify({ following: [], memberOf: [] });
    const start = from ? new Date(from) : this.getStartOfWeek();
    const end = to ? new Date(to) : new Date();
    // Proposals in range where user has NOT voted
    const votedProposalIds = await db
      .select({ proposalId: snapshotVote.proposalId })
      .from(snapshotVote)
      .where(
        and(
          eq(snapshotVote.voter, userId),
          gte(snapshotVote.created, start),
          lte(snapshotVote.created, end),
        ),
      );
    const ids = votedProposalIds.map((v) => v.proposalId);

    // Get space IDs the user is following
    const followingSpaces = await db
      .select({ spaceId: snapshotFollow.spaceId })
      .from(snapshotFollow)
      .where(eq(snapshotFollow.follower, userId));
    const followingSpaceIds = followingSpaces.map((s) => s.spaceId);

    // Get space IDs the user is a member of
    const memberSpaces = await db
      .select({ spaceId: snapshotSpaceMember.spaceId })
      .from(snapshotSpaceMember)
      .where(eq(snapshotSpaceMember.memberId, userId));
    const memberSpaceIds = memberSpaces.map((s) => s.spaceId);

    // Proposals in following spaces
    const followingProposals = followingSpaceIds.length
      ? await db
          .select()
          .from(snapshotProposal)
          .where(
            and(
              gte(snapshotProposal.createdAt, start),
              lte(snapshotProposal.createdAt, end),
              inArray(snapshotProposal.spaceId, followingSpaceIds),
              ids.length ? not(inArray(snapshotProposal.id, ids)) : undefined,
            ),
          )
      : [];

    // Proposals in memberOf spaces
    const memberOfProposals = memberSpaceIds.length
      ? await db
          .select()
          .from(snapshotProposal)
          .where(
            and(
              gte(snapshotProposal.createdAt, start),
              lte(snapshotProposal.createdAt, end),
              inArray(snapshotProposal.spaceId, memberSpaceIds),
              ids.length ? not(inArray(snapshotProposal.id, ids)) : undefined,
            ),
          )
      : [];

    return JSON.stringify({
      following: followingProposals,
      memberOf: memberOfProposals,
    });
  }

  @CreateAction({
    name: 'get_addressed_proposals',
    description:
      'Get proposals voted on by the user. The system can infer the user ID from context if not provided. The time range defaults to the current week if not specified',
    schema: GetProposalsSchema,
  })
  async getAddressedProposals(
    _: null,
    args?: z.infer<typeof GetProposalsSchema>,
  ) {
    console.log('getAddressedProposals', args);
    const safeArgs = args ?? {};
    let { userId, from, to } = safeArgs;
    if (!userId && this.userAddress) userId = this.userAddress;
    if (!userId) return JSON.stringify({ proposals: [] });
    const start = from ? new Date(from) : this.getStartOfWeek();
    const end = to ? new Date(to) : new Date();
    // Proposals where user has voted
    const votedProposalIds = await db
      .select({ proposalId: snapshotVote.proposalId })
      .from(snapshotVote)
      .where(
        and(
          eq(snapshotVote.voter, userId),
          gte(snapshotVote.created, start),
          lte(snapshotVote.created, end),
        ),
      );
    const ids = votedProposalIds.map((v) => v.proposalId);
    const proposals = ids.length
      ? await db
          .select()
          .from(snapshotProposal)
          .where(inArray(snapshotProposal.id, ids))
      : [];
    return JSON.stringify({ proposals });
  }

  getStartOfWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(now.setDate(diff));
  }
}

export const snapshotActionProvider = (userAddress?: string) =>
  new SnapshotActionProvider(userAddress);
