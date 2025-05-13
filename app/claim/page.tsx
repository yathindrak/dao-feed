import { snapshotPrizePool } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ClaimForm } from '@/components/claim-form';
import { format } from 'date-fns';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}
const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

export default async function ClaimPage() {
  // Get current month and year
  const now = new Date();

  // We want to show the previous month's rewards for claiming
  let claimMonth = now.getUTCMonth(); // 0-11
  let claimYear = now.getUTCFullYear();

  // Handle January - need to get December of previous year
  if (claimMonth === 0) {
    claimMonth = 12;
    claimYear -= 1;
  }

  // Format month and year
  const claimMonthStr = String(claimMonth).padStart(2, '0');
  const claimYearStr = String(claimYear);

  // Get the available reward pool for the previous month
  const rewardPool = await db
    .select({
      year: snapshotPrizePool.year,
      month: snapshotPrizePool.month,
      amount: snapshotPrizePool.amount,
      currency: snapshotPrizePool.currency,
    })
    .from(snapshotPrizePool)
    .where(
      and(
        eq(snapshotPrizePool.year, claimYearStr),
        eq(snapshotPrizePool.month, claimMonthStr),
      ),
    )
    .limit(1);

  // Get formatted month name for display
  const monthName = format(new Date(claimYear, claimMonth - 1), 'MMMM yyyy');

  const hasRewardPool = rewardPool.length > 0;

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <h1 className="text-3xl font-bold mb-2 text-center text-foreground">
        Claim Your DAO Rewards
      </h1>
      <p className="text-center text-muted-foreground mb-8">
        Claim your rewards for contributions made in the previous month
      </p>

      {hasRewardPool ? (
        <ClaimForm pool={rewardPool[0]} />
      ) : (
        <div className="max-w-md mx-auto bg-card rounded-lg shadow-lg p-6 text-center border border-border">
          <h2 className="text-xl font-medium mb-4 text-card-foreground">
            No Reward Pool Available
          </h2>
          <p className="text-muted-foreground mb-4">
            The reward pool for {monthName} has not been set up yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Please check back later. Reward pools are typically set up within
            the first few days of each month.
          </p>
        </div>
      )}

      <div className="mt-8 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-4 text-foreground">
          How Rewards Work
        </h2>
        <div className="bg-card rounded-lg p-6 border border-border">
          <ol className="space-y-4 list-decimal pl-5">
            <li className="text-card-foreground">
              <span className="font-medium">Contribute to DAO governance</span>
              <p className="text-sm text-muted-foreground mt-1">
                Cast votes on proposals and create proposals on Snapshot to earn
                contribution points.
              </p>
            </li>
            <li className="text-card-foreground">
              <span className="font-medium">Monthly rewards calculation</span>
              <p className="text-sm text-muted-foreground mt-1">
                Your share of the reward pool is calculated based on your
                contribution percentage compared to all users.
              </p>
            </li>
            <li className="text-card-foreground">
              <span className="font-medium">Claim your rewards</span>
              <p className="text-sm text-muted-foreground mt-1">
                At the start of each month, you can claim rewards for your
                contributions from the previous month.
              </p>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
