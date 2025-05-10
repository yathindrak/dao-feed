import { inngest } from './client';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  snapshotSpace,
  snapshotProposal,
  snapshotUser,
  snapshotVote,
  snapshotSpaceMember,
  snapshotFollow,
  snapshotSyncState,
} from '../db/schema';
import { gt, and, eq, lt, inArray, sql } from 'drizzle-orm';

const SNAPSHOT_API = 'https://hub.snapshot.org/graphql';
const BATCH_SIZE = 1000;
// const RATE_LIMIT = 60;
// const RATE_LIMIT_SLEEP = 60 * 1000;
const MAX_RETRIES = 3;
const SIX_HOURS = 6 * 60 * 60 * 1000;

// Initialize database connection
if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL environment variable is not set');
  process.exit(1);
}

const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

// Helper function to make a single GraphQL request without retries
async function makeGraphQLRequest(query: string, variables: any = {}) {
  const response = await fetch(SNAPSHOT_API, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

// Wrapper function to handle retries
async function queryWithRetries(
  query: string,
  variables: any = {},
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await makeGraphQLRequest(query, variables);
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      if (attempt < MAX_RETRIES) {
        // Exponential backoff
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
    }
  }

  console.error(
    'All retry attempts failed for GraphQL query:',
    lastError?.message,
  );
  return null;
}

// Index Active Proposals and Related Data
export const indexActiveProposals = inngest.createFunction(
  { id: 'index-active-proposals' },
  { cron: '0 */2 * * *' }, // Run every 2 hours
  async ({ step }: { step: any }) => {
    try {
      const now = new Date();

      // Get last sync state or create initial state
      const syncState = await step.run('fetch-sync-state', async () => {
        const state = await db
          .select()
          .from(snapshotSyncState)
          .where(eq(snapshotSyncState.id, 'proposals'))
          .limit(1);

        if (state.length === 0) {
          // If no sync state exists, start from 24 hours ago
          const initialLastCreatedAt = new Date(
            now.getTime() - 24 * 60 * 60 * 1000,
          );
          await db.insert(snapshotSyncState).values({
            id: 'proposals',
            lastSyncedAt: now,
            lastCreatedAt: initialLastCreatedAt,
          });
          return {
            lastCreatedAt: initialLastCreatedAt,
          };
        }

        return { lastCreatedAt: state[0]?.lastCreatedAt };
      });
      //  ex: "lastCreatedAt": "2025-05-07T03:36:31.323Z"

      // Fetch new proposals since last sync
      let skip = 0;
      let lastCreatedAt = syncState.lastCreatedAt;
      let keepFetching = true;

      while (keepFetching) {
        const newProposalsQuery = `
          query Proposals {
            proposals(
              first: ${BATCH_SIZE},
              skip: ${skip},
              where: {
                created_gt: ${Math.floor(new Date(syncState.lastCreatedAt).getTime() / 1000)}
              },
              orderBy: "created",
              orderDirection: asc
            ) {
              id
              title
              body
              choices
              start
              end
              snapshot
              state
              author
              scores
              scores_total
              created
              space {
                id
                name
              }
            }
          }
        `;

        const newProposalsData = await step.run(
          `fetch-new-proposals-batch-${skip}`,
          async () => {
            return queryWithRetries(newProposalsQuery, {});
          },
        );

        const newProposals = newProposalsData?.proposals ?? [];

        // Process new proposals
        for (const proposal of newProposals) {
          const proposalCreatedAt = new Date(proposal.created * 1000);

          // Keep track of the latest proposal timestamp
          if (proposalCreatedAt > lastCreatedAt) {
            lastCreatedAt = proposalCreatedAt;
          }

          // Check and update space data if needed (flattened, not inside step.run)
          const space = await db
            .select()
            .from(snapshotSpace)
            .where(eq(snapshotSpace.id, proposal.space.id))
            .limit(1);

          const shouldUpdateSpace =
            !space[0]?.lastIndexedAt ||
            now.getTime() - space[0].lastIndexedAt.getTime() > SIX_HOURS;

          if (shouldUpdateSpace) {
            await step.run(
              `update-space-data-${proposal.space.id}`,
              async () => {
                await updateSpaceData(proposal.space.id, now);
              },
            );
          }

          console.log({ proposal });
          // Save new proposal (step.run is now only for saving, not for updateSpaceData)
          await step.run(
            `save-new-proposal-${proposal.id}-n-sync-votes`,
            async () => {
              await db
                .insert(snapshotProposal)
                .values({
                  id: proposal.id,
                  spaceId: proposal.space.id,
                  title: proposal.title,
                  body: proposal.body,
                  choices: proposal.choices || [],
                  start: new Date(proposal.start * 1000),
                  end: new Date(proposal.end * 1000),
                  snapshot: proposal.snapshot,
                  state: proposal.state,
                  author: proposal.author,
                  scores: proposal.scores || [],
                  scoresTotal: proposal.scores_total?.toString() || '0',
                  createdAt: proposalCreatedAt,
                })
                .onConflictDoNothing();

              // Fetch and update votes for the new proposal
              const votesQuery = `
                query Votes {
                  votes(
                    first: ${BATCH_SIZE},
                    where: { proposal: "${proposal.id}" },
                    orderBy: "created",
                    orderDirection: desc
                  ) {
                    id
                    voter
                    choice
                    created
                  }
                }
              `;

              const votesData = await queryWithRetries(votesQuery, {});

              if (votesData?.votes && votesData.votes.length > 0) {
                // Prepare bulk insert data
                const votesToInsert = votesData.votes.map((vote: any) => ({
                  id: vote.id,
                  voter: vote.voter,
                  choice: vote.choice,
                  proposalId: proposal.id,
                  created: new Date(vote.created * 1000),
                }));

                // Ensure all voters exist in snapshot_user
                const voterIds = Array.from(
                  new Set(votesToInsert.map((v: { voter: string }) => v.voter)),
                ) as string[];
                if (voterIds.length > 0) {
                  const existingUsers = await db
                    .select({ id: snapshotUser.id })
                    .from(snapshotUser)
                    .where(inArray(snapshotUser.id, voterIds));
                  const existingUserIds = new Set(
                    existingUsers.map((u: { id: string }) => u.id),
                  );
                  const missingVoters: string[] = voterIds.filter(
                    (id: string) => !existingUserIds.has(id),
                  );
                  if (missingVoters.length > 0) {
                    await db
                      .insert(snapshotUser)
                      .values(
                        missingVoters.map((id: string) => ({
                          id,
                          lastIndexedAt: new Date(),
                        })),
                      )
                      .onConflictDoNothing();
                  }
                }

                // Bulk insert with onConflictDoUpdate
                await db
                  .insert(snapshotVote)
                  .values(votesToInsert)
                  .onConflictDoUpdate({
                    target: snapshotVote.id,
                    set: {
                      choice: sql`excluded.choice`,
                    },
                  });

                console.log(
                  `Bulk inserted/updated ${votesToInsert.length} votes for proposal ${proposal.id}`,
                );
              }
            },
          );
        }

        if (newProposals.length < BATCH_SIZE) {
          keepFetching = false;
        } else {
          skip += BATCH_SIZE;
        }
      }

      // Update sync state with the latest timestamp
      await step.run('update-sync-state', async () => {
        await db
          .update(snapshotSyncState)
          .set({
            lastSyncedAt: now,
            lastCreatedAt: new Date(lastCreatedAt),
          })
          .where(eq(snapshotSyncState.id, 'proposals'));
      });

      return { success: true };
    } catch (error) {
      console.error('Error in indexActiveProposals:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: false,
      };
    }
  },
);

// Sync votes for ended proposals that haven't been marked as synced
export const syncEndedProposalVotes = inngest.createFunction(
  { id: 'sync-ended-proposal-votes' },
  { cron: '0 */2 * * *' }, // Run every 2 hours
  async ({ step }: { step: any }) => {
    return step.run('sync-ended-proposal-votes-main', async () => {
      try {
        const now = new Date();
        // Find proposals that have ended and not yet synced
        const proposalsToSync = await db
          .select()
          .from(snapshotProposal)
          .where(
            and(
              lt(snapshotProposal.end, now), // can remove this if we want more uptodate data
              eq(snapshotProposal.votesSynced, false),
            ),
          );

        for (const proposal of proposalsToSync) {
          // Fetch all votes for this proposal from Snapshot
          const votesQuery = `
            query Votes {
              votes(
                first: ${BATCH_SIZE},
                where: { proposal: "${proposal.id}" },
                orderBy: "created",
                orderDirection: desc
              ) {
                id
                voter
                choice
                created
              }
            }
          `;
          const votesData = await queryWithRetries(votesQuery, {});
          const votes = votesData?.votes || [];
          if (votes.length > 0) {
            // Prepare bulk insert data
            const votesToInsert = votes.map((vote: any) => ({
              id: vote.id,
              voter: vote.voter,
              choice: vote.choice,
              proposalId: proposal.id,
              created: new Date(vote.created * 1000),
            }));
            // Ensure all voters exist in snapshot_user
            const voterIds = Array.from(
              new Set(votesToInsert.map((v: { voter: string }) => v.voter)),
            ) as string[];
            if (voterIds.length > 0) {
              const existingUsers = await db
                .select({ id: snapshotUser.id })
                .from(snapshotUser)
                .where(inArray(snapshotUser.id, voterIds));
              const existingUserIds = new Set(
                existingUsers.map((u: { id: string }) => u.id),
              );
              const missingVoters: string[] = voterIds.filter(
                (id: string) => !existingUserIds.has(id),
              );
              if (missingVoters.length > 0) {
                await db
                  .insert(snapshotUser)
                  .values(
                    missingVoters.map((id: string) => ({
                      id,
                      lastIndexedAt: new Date(),
                    })),
                  )
                  .onConflictDoNothing();
              }
            }
            // Bulk insert with onConflictDoUpdate
            await db
              .insert(snapshotVote)
              .values(votesToInsert)
              .onConflictDoUpdate({
                target: snapshotVote.id,
                set: { choice: sql`excluded.choice` },
              });
          }
          // Mark proposal as votesSynced
          await db
            .update(snapshotProposal)
            .set({ votesSynced: true })
            .where(eq(snapshotProposal.id, proposal.id));
        }
        return { success: true, synced: proposalsToSync.length };
      } catch (error) {
        console.error('Error in syncEndedProposalVotes:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          shouldRetry: false,
        };
      }
    });
  },
);

// Helper function to update space data and its follows
async function updateSpaceData(spaceId: string, now: Date) {
  const spaceQuery = `
    query Space {
      space(id: "${spaceId}") {
        id
        name
        about
        network
        symbol
        strategies {
          name
          params
        }
        members
        admins
      }
    }
  `;

  const spaceData = await queryWithRetries(spaceQuery, {});

  if (spaceData?.space) {
    console.log(`Updating space ${spaceId}`);
    await db
      .insert(snapshotSpace)
      .values({
        ...spaceData.space,
        strategies: spaceData.space.strategies || [],
        lastIndexedAt: now,
      })
      .onConflictDoUpdate({
        target: snapshotSpace.id,
        set: {
          name: spaceData.space.name,
          about: spaceData.space.about,
          network: spaceData.space.network,
          symbol: spaceData.space.symbol,
          strategies: spaceData.space.strategies || [],
          lastIndexedAt: now,
        },
      });

    // Update members
    const allMembers = [
      ...new Set([
        ...(spaceData.space.members || []),
        ...(spaceData.space.admins || []),
      ]),
    ];

    if (allMembers.length > 0) {
      console.log(`All members ${allMembers.length}`);
      const membersQuery = `
          query Users {
            users(
              where: { id_in: ${JSON.stringify(allMembers)} }
            ) {
              id
              name
              about
              avatar
              farcaster
              lastVote
              lens
              twitter
            }
          }
        `;

      const mems = await queryWithRetries(membersQuery, {});
      const users = mems?.users || [];
      console.log('Members data fetched');
      console.log(`Found ${users.length} members`);

      // TODO: Make below and update users a transaction if possible
      // First mark all existing active members as inactive before update
      await db
        .update(snapshotSpaceMember)
        .set({
          isActive: false,
          removedAt: now,
        })
        .where(
          and(
            eq(snapshotSpaceMember.spaceId, spaceData.space.id),
            eq(snapshotSpaceMember.isActive, true),
          ),
        );
      console.log(`Marked ${allMembers.length} active members as inactive`);
      for (const user of users) {
        console.log(`Updating user ${user.id}`);
        // Update user
        await db
          .insert(snapshotUser)
          .values({
            ...user,
            lastIndexedAt: now,
          })
          .onConflictDoUpdate({
            target: snapshotUser.id,
            set: {
              name: user.name,
              about: user.about,
              avatar: user.avatar,
              farcaster: user.farcaster,
              lastVote: user.lastVote,
              lens: user.lens,
              twitter: user.twitter,
              lastIndexedAt: now,
            },
          });

        // Update membership
        await db
          .insert(snapshotSpaceMember)
          .values({
            spaceId: spaceData.space.id,
            memberId: user.id,
            addedAt: now,
            isActive: true,
            removedAt: null,
          })
          .onConflictDoUpdate({
            target: [snapshotSpaceMember.spaceId, snapshotSpaceMember.memberId],
            set: {
              isActive: true,
              removedAt: null,
              addedAt: now,
            },
          });
      }
    }

    // Fetch and update follows for the space
    const followsQuery = `
        query SpaceFollows {
          follows(
            first: ${BATCH_SIZE},
            where: { space: "${spaceData.space.id}" }
          ) {
            id
            follower
            space {
              id
            }
            created
          }
        }
      `;

    const followsData = await queryWithRetries(followsQuery, {});
    const follows = followsData?.follows || [];

    // Bulk check follower existence
    const followerIds = follows.map((f: any) => f.follower);
    console.log(`Checking ${followerIds.length} followers`);
    let existingFollowers: string[] = [];
    if (followerIds.length > 0) {
      const rows = await db
        .select({ id: snapshotUser.id })
        .from(snapshotUser)
        .where(inArray(snapshotUser.id, followerIds));
      existingFollowers = rows.map((r) => r.id);
    }

    console.log(`Found ${existingFollowers.length} existing followers`);
    for (const follow of follows) {
      if (!existingFollowers.includes(follow.follower)) continue;
      await db
        .insert(snapshotFollow)
        .values({
          id: follow.id,
          follower: follow.follower,
          spaceId: follow.space.id,
          created: new Date(follow.created * 1000),
          lastIndexedAt: now,
        })
        .onConflictDoUpdate({
          target: snapshotFollow.id,
          set: {
            lastIndexedAt: now,
          },
        });
    }
  }
}
