import { inngest } from './client';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  snapshotSpace,
  snapshotProposal,
  snapshotUser,
  snapshotVote,
  snapshotSpaceMember,
  snapshotUserMonthlyActivity,
} from '../db/schema';
import { gt, and, eq } from 'drizzle-orm';

const SNAPSHOT_API = 'https://hub.snapshot.org/graphql';
const BATCH_SIZE = 1000;
const RATE_LIMIT = 60; // requests per minute
const RATE_LIMIT_SLEEP = 60 * 1000; // 1 minute in milliseconds
const MAX_RETRIES = 3;
const PROPOSALS_CUTOFF_DATE = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60; // 30 days ago in seconds

// Initialize database connection
if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL environment variable is not set');
  process.exit(1);
}

const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

interface SnapshotVote {
  id: string;
  voter: string;
  choice: any;
  created: number;
}

/**
 * Formats a month number to a two-digit string with leading zero padding.
 * This padding is crucial for:
 * 1. Database Consistency: Ensures reliable sorting and querying of records
 * 2. Standard Compliance: Follows date formatting standards (e.g., ISO 8601)
 * 3. Sorting Correctness: Without padding, string sorting would order months as:
 *    1, 10, 11, 12, 2, 3, ... instead of 01, 02, 03, ...
 *
 * @param month - Month number (1-12)
 * @returns Two-digit month string (01-12)
 */
function padMonth(month: number): string {
  return month.toString().padStart(2, '0');
}

// Helper function to make a single GraphQL request without retries
async function makeGraphQLRequest(query: string, variables: any = {}) {
  const response = await fetch(SNAPSHOT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  // TODO: I dont think data.error is present?
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

// Wrapper function to handle retries with step.sleep
async function queryWithRetries(
  step: any,
  stepName: string,
  query: string,
  variables: any = {},
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await step.run(`${stepName}-attempt-${attempt}`, async () => {
        return makeGraphQLRequest(query, variables);
      });
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error);

      if (attempt < MAX_RETRIES) {
        // Exponential backoff using step.sleep
        const backoffMs = Math.pow(2, attempt) * 1000;
        await step.sleep(`${stepName}-backoff-${attempt}`, backoffMs);
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

// Batch processor that handles rate limiting
async function processBatchWise<T, R>({
  items,
  batchSize,
  step,
  processItem,
  stepNamePrefix,
}: {
  items: T[];
  batchSize: number;
  step: any;
  processItem: (items: T[]) => Promise<R[]>;
  stepNamePrefix: string;
}): Promise<R[]> {
  const results: R[] = [];
  let requestCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    // If we've hit rate limit, sleep
    if (requestCount >= RATE_LIMIT) {
      await step.sleep(`${stepNamePrefix}-rate-limit-${i}`, RATE_LIMIT_SLEEP);
      requestCount = 0;
    }

    const batch = items.slice(i, i + batchSize);
    const batchResults = await step.run(
      `${stepNamePrefix}-batch-${i}`,
      async () => {
        return processItem(batch);
      },
    );

    results.push(...(batchResults || []));
    requestCount++;

    // Sleep between batches if not the last batch
    if (i + batchSize < items.length) {
      await step.sleep(`${stepNamePrefix}-batch-pause-${i}`, 1000);
    }
  }

  return results;
}

// Helper function to get current month's activity
async function getCurrentMonthActivity(userId: string, db: any) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = padMonth(now.getMonth() + 1); // Convert 0-based month to 1-based and pad

  const activity = await db
    .select()
    .from(snapshotUserMonthlyActivity)
    .where(
      and(
        eq(snapshotUserMonthlyActivity.userId, userId),
        eq(snapshotUserMonthlyActivity.year, year),
        eq(snapshotUserMonthlyActivity.month, month),
      ),
    );

  console.log(
    `[getCurrentMonthActivity] ${JSON.stringify(activity)} : ${userId} : ${year} : ${month}`,
  );

  return activity[0];
}

// Helper function to update monthly activity
async function updateMonthlyActivity(
  userId: string,
  proposalsDelta: number,
  votesDelta: number,
  db: any,
) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = padMonth(now.getMonth() + 1); // Convert 0-based month to 1-based and pad

  const currentActivity = await getCurrentMonthActivity(userId, db);

  if (currentActivity) {
    await db
      .update(snapshotUserMonthlyActivity)
      .set({
        proposalsCount: (currentActivity.proposalsCount || 0) + proposalsDelta,
        votesCount: (currentActivity.votesCount || 0) + votesDelta,
        lastUpdatedAt: now,
      })
      .where(
        and(
          eq(snapshotUserMonthlyActivity.userId, userId),
          eq(snapshotUserMonthlyActivity.year, year),
          eq(snapshotUserMonthlyActivity.month, month),
        ),
      );
  } else {
    await db.insert(snapshotUserMonthlyActivity).values({
      userId,
      year,
      month,
      proposalsCount: proposalsDelta,
      votesCount: votesDelta,
      lastUpdatedAt: now,
    });
  }
}

// Index Spaces (DAOs)
export const indexSpaces = inngest.createFunction(
  { id: 'index-snapshot-spaces' },
  { cron: '0 */6 * * *' }, // Run every 6 hours
  async ({ step }: { step: any }) => {
    try {
      const allSpaces: any[] = [];
      let skip = 0;
      let hasMore = true;

      // Fetch all spaces first
      while (hasMore) {
        const query = `
          query Spaces {
            spaces(
              first: ${BATCH_SIZE},
              skip: ${skip},
              orderBy: "created",
              orderDirection: asc
            ) {
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
              filters {
                minScore
                onlyMembers
              }
              plugins
            }
          }
        `;

        const data = await queryWithRetries(
          step,
          `fetch-spaces-${skip}`,
          query,
        );
        const spacesData = data?.spaces || [];

        if (!spacesData || spacesData.length === 0) {
          hasMore = false;
        } else {
          allSpaces.push(...spacesData);
          skip += BATCH_SIZE;
          await step.sleep(`spaces-batch-pause-${skip}`, 1000);
        }
      }

      // Process spaces in batches
      await processBatchWise({
        items: allSpaces,
        batchSize: 10,
        step,
        stepNamePrefix: 'save-spaces',
        processItem: async (spaces) => {
          for (const space of spaces) {
            try {
              // Save space
              await db
                .insert(snapshotSpace)
                .values({
                  ...space,
                  strategies: space.strategies || [],
                  lastIndexedAt: new Date(),
                })
                .onConflictDoNothing();

              // Get all members
              const allMembers = [
                ...new Set([...(space.members || []), ...(space.admins || [])]),
              ];

              // First mark all existing active members as inactive
              await db
                .update(snapshotSpaceMember)
                .set({
                  isActive: false,
                  removedAt: new Date(),
                })
                .where(
                  and(
                    eq(snapshotSpaceMember.spaceId, space.id),
                    eq(snapshotSpaceMember.isActive, true),
                  ),
                );

              if (allMembers.length > 0) {
                // Fetch member details
                const query = `
                  query Users {
                    users(
                      where: { id_in: ${JSON.stringify(allMembers)} }
                    ) {
                      id
                      name
                      about
                      avatar
                      proposalsCount
                      votesCount
                      farcaster
                      lastVote
                      lens
                      twitter
                    }
                  }
                `;

                const data = await queryWithRetries(
                  step,
                  `fetch-members-${space.id}`,
                  query,
                );
                const users = data?.users || [];

                // Save users and memberships
                // Here we dont use the user.proposalsCount and user.votesCount
                // because we fetch them in the indexVotesAndUsers function
                // and we dont want to fetch them again here and distrupt the delta calculation
                for (const user of users) {
                  await db
                    .insert(snapshotUser)
                    .values({
                      id: user.id,
                      name: user.name,
                      about: user.about,
                      avatar: user.avatar,
                      farcaster: user.farcaster,
                      lastVote: user.lastVote,
                      lens: user.lens,
                      twitter: user.twitter,
                      lastIndexedAt: new Date(),
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
                        lastIndexedAt: new Date(),
                      },
                    });

                  // Update or insert member status
                  await db
                    .insert(snapshotSpaceMember)
                    .values({
                      spaceId: space.id,
                      memberId: user.id,
                      addedAt: new Date(),
                      isActive: true,
                      removedAt: null,
                    })
                    .onConflictDoUpdate({
                      target: [
                        snapshotSpaceMember.spaceId,
                        snapshotSpaceMember.memberId,
                      ],
                      set: {
                        isActive: true,
                        removedAt: null,
                        addedAt: new Date(),
                      },
                    });
                }
              }
            } catch (error) {
              console.error(`Failed to process space ${space.id}:`, error);
            }
          }
          return spaces;
        },
      });

      return { success: true };
    } catch (error) {
      console.error('Error in indexSpaces:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: false,
      };
    }
  },
);

// Index Proposals
export const indexProposals = inngest.createFunction(
  { id: 'index-snapshot-proposals' },
  { cron: '0 */6 * * *' }, // Run every 6 hours
  async ({ step }: { step: any }) => {
    try {
      const spaces = await step.run('fetch-spaces', async () => {
        return await db.select().from(snapshotSpace);
      });

      for (const space of spaces) {
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
          // Fetch proposals for the space
          const proposals = await step.run(
            `fetch-proposals-${space.id}-${skip}`,
            async () => {
              const query = `
              query Proposals {
                proposals(
                  first: ${BATCH_SIZE},
                  skip: ${skip},
                  where: { 
                    space: "${space.id}",
                    created_gt: ${PROPOSALS_CUTOFF_DATE}
                  },
                  orderBy: "created",
                  orderDirection: desc
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
                }
              }
            `;

              const data = await queryWithRetries(
                step,
                `fetch-proposals-${space.id}`,
                query,
              );
              if (!data) {
                console.error(
                  `Failed to fetch proposals for space ${space.id}`,
                );
                return null;
              }
              return data.proposals;
            },
          );

          if (!proposals || proposals.length === 0) {
            hasMore = false;
            continue;
          }

          // Save proposals in batches
          const proposalBatches = [];
          for (let i = 0; i < proposals.length; i += 50) {
            proposalBatches.push(proposals.slice(i, i + 50));
          }

          for (const batch of proposalBatches) {
            await step.run(
              `save-proposals-${space.id}-${batch[0]?.id}`,
              async () => {
                for (const proposal of batch) {
                  try {
                    await db
                      .insert(snapshotProposal)
                      .values({
                        ...proposal,
                        spaceId: space.id,
                        choices: proposal.choices || [],
                        scores: proposal.scores || [],
                        scoresTotal: proposal.scores_total?.toString() || '0',
                        start: new Date(proposal.start * 1000),
                        end: new Date(proposal.end * 1000),
                        createdAt: new Date(proposal.created * 1000),
                      })
                      .onConflictDoUpdate({
                        target: snapshotProposal.id,
                        set: {
                          title: proposal.title,
                          body: proposal.body,
                          choices: proposal.choices || [],
                          state: proposal.state,
                          scores: proposal.scores || [],
                          scoresTotal: proposal.scores_total?.toString() || '0',
                        },
                      });
                  } catch (error) {
                    console.error(
                      `Failed to save proposal ${proposal.id}:`,
                      error,
                    );
                    // Continue with next proposal
                  }
                }
              },
            );
          }

          skip += BATCH_SIZE;
          await step.sleep(`rate-limit-proposals-${space.id}-${skip}`, 1000);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in indexProposals:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: false, // Signal to Inngest that we don't want to retry
      };
    }
  },
);

// Index Votes and Users with monthly tracking
export const indexVotesAndUsers = inngest.createFunction(
  { id: 'index-snapshot-votes-and-users' },
  { cron: '0 */6 * * *' }, // Run every 6 hours
  async ({ step }: { step: any }) => {
    try {
      // Get recent proposals to fetch votes for
      const recentProposals = await step.run(
        'fetch-recent-proposals',
        async () => {
          // Since we're running every 6 hours, let's look back 7 days instead of 24 hours
          // This gives us more overlap and ensures we don't miss any data
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return await db
            .select()
            .from(snapshotProposal)
            .where(gt(snapshotProposal.end, sevenDaysAgo));
        },
      );

      // Process proposals in smaller batches
      const proposalBatches = [];
      for (let i = 0; i < recentProposals.length; i += 5) {
        proposalBatches.push(recentProposals.slice(i, i + 5));
      }

      for (const batch of proposalBatches) {
        for (const proposal of batch) {
          let skip = 0;
          let hasMore = true;

          while (hasMore) {
            // Fetch votes for the proposal
            const votes = await step.run(
              `fetch-votes-${proposal.id}-${skip}`,
              async () => {
                const query = `
                  query Votes {
                    votes(
                      first: ${BATCH_SIZE},
                      skip: ${skip},
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

                const data = await queryWithRetries(
                  step,
                  `fetch-votes-${proposal.id}`,
                  query,
                );
                return data?.votes as SnapshotVote[];
              },
            );

            if (!votes || votes.length === 0) {
              hasMore = false;
              continue;
            }

            const uniqueVoters = [
              ...new Set((votes as SnapshotVote[]).map((vote) => vote.voter)),
            ];

            // Process voters in smaller batches
            const voterBatches = [];
            for (let i = 0; i < uniqueVoters.length; i += 10) {
              voterBatches.push(uniqueVoters.slice(i, i + 10));
            }

            for (const voterBatch of voterBatches) {
              // Fetch user data
              const userData = await step.run(
                `fetch-users-${proposal.id}-${voterBatch[0]}`,
                async () => {
                  const query = `
                    query Users {
                      users(
                        where: { id_in: ${JSON.stringify(voterBatch)} }
                      ) {
                        id
                        name
                        about
                        avatar
                        proposalsCount
                        votesCount
                        farcaster
                        lastVote
                        lens
                        twitter
                      }
                    }
                  `;

                  const data = await queryWithRetries(
                    step,
                    `fetch-users-${proposal.id}`,
                    query,
                  );
                  return data?.users || [];
                },
              );

              // Process and save user data
              await step.run(
                `save-users-${proposal.id}-${voterBatch[0]}`,
                async () => {
                  for (const user of userData) {
                    try {
                      // Get previous user data to calculate deltas
                      const existingUser = await db
                        .select()
                        .from(snapshotUser)
                        .where(eq(snapshotUser.id, user.id));

                      const previousProposalsCount =
                        existingUser[0]?.proposalsCount || 0;
                      const previousVotesCount =
                        existingUser[0]?.votesCount || 0;

                      // Update user
                      await db
                        .insert(snapshotUser)
                        .values({
                          ...user,
                          proposalsCount: user.proposalsCount || 0,
                          votesCount: user.votesCount || 0,
                          lastIndexedAt: new Date(),
                        })
                        .onConflictDoUpdate({
                          target: snapshotUser.id,
                          set: {
                            name: user.name,
                            about: user.about,
                            avatar: user.avatar,
                            proposalsCount: user.proposalsCount || 0,
                            votesCount: user.votesCount || 0,
                            farcaster: user.farcaster,
                            lastVote: user.lastVote,
                            lens: user.lens,
                            twitter: user.twitter,
                            lastIndexedAt: new Date(),
                          },
                        });

                      // Calculate and update monthly deltas
                      const proposalsDelta =
                        Number(user.proposalsCount || 0) -
                        Number(previousProposalsCount);
                      const votesDelta =
                        Number(user.votesCount || 0) -
                        Number(previousVotesCount);

                      if (proposalsDelta > 0 || votesDelta > 0) {
                        await updateMonthlyActivity(
                          user.id,
                          proposalsDelta,
                          votesDelta,
                          db,
                        );
                      }
                    } catch (error) {
                      console.error(
                        `Failed to process user ${user.id}:`,
                        error,
                      );
                    }
                  }
                },
              );
            }

            // Save votes in batches
            const voteBatches = [];
            for (let i = 0; i < votes.length; i += 50) {
              voteBatches.push(votes.slice(i, i + 50));
            }

            for (const voteBatch of voteBatches) {
              await step.run(
                `save-votes-${proposal.id}-${voteBatch[0]?.id}`,
                async () => {
                  for (const vote of voteBatch as SnapshotVote[]) {
                    try {
                      await db
                        .insert(snapshotVote)
                        .values({
                          ...vote,
                          proposalId: proposal.id,
                          created: new Date(vote.created * 1000),
                        })
                        .onConflictDoUpdate({
                          target: snapshotVote.id,
                          set: {
                            choice: vote.choice,
                          },
                        });
                    } catch (error) {
                      console.error(`Failed to save vote ${vote.id}:`, error);
                    }
                  }
                },
              );
            }

            skip += BATCH_SIZE;
            await step.sleep(`rate-limit-votes-${proposal.id}-${skip}`, 1000);
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in indexVotesAndUsers:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        shouldRetry: false,
      };
    }
  },
);
