import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { snapshotUserMonthlyActivity, userRewardClaim } from '@/lib/db/schema';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}
const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');
    // Always use last month
    const now = new Date();
    let month = now.getUTCMonth(); // 0-11
    let year = now.getUTCFullYear();
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    if (!address) {
      return NextResponse.json(
        { error: 'Missing required parameter: address' },
        { status: 400 },
      );
    }

    // Query the database for the user's contribution
    const userActivity = await db
      .select({
        userId: snapshotUserMonthlyActivity.userId,
        year: snapshotUserMonthlyActivity.year,
        month: snapshotUserMonthlyActivity.month,
        contributionPercent: snapshotUserMonthlyActivity.contributionPercent,
        votesCount: snapshotUserMonthlyActivity.votesCount,
        proposalsCount: snapshotUserMonthlyActivity.proposalsCount,
      })
      .from(snapshotUserMonthlyActivity)
      .where(
        and(
          eq(snapshotUserMonthlyActivity.userId, address),
          eq(snapshotUserMonthlyActivity.year, yearStr),
          eq(snapshotUserMonthlyActivity.month, monthStr),
        ),
      )
      .limit(1);

    // Check if already claimed
    const userClaims = await db
      .select({
        id: userRewardClaim.id,
        claimedAt: userRewardClaim.claimedAt,
        amount: userRewardClaim.amount,
        currency: userRewardClaim.currency,
      })
      .from(userRewardClaim)
      .where(
        and(
          eq(userRewardClaim.userId, address),
          eq(userRewardClaim.year, yearStr),
          eq(userRewardClaim.month, monthStr),
        ),
      )
      .limit(1);

    const claimed = userClaims.length > 0;

    if (userActivity.length === 0) {
      // If no data found, return zero contribution
      return NextResponse.json({
        contributionPercent: '0',
        votesCount: 0,
        proposalsCount: 0,
        claimed,
        claimData: claimed ? userClaims[0] : null,
      });
    }

    // Return the user's contribution data
    return NextResponse.json({
      contributionPercent: userActivity[0].contributionPercent || '0',
      votesCount: userActivity[0].votesCount || 0,
      proposalsCount: userActivity[0].proposalsCount || 0,
      claimed,
      claimData: claimed ? userClaims[0] : null,
    });
  } catch (error) {
    console.error('Error fetching user contribution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user contribution' },
      { status: 500 },
    );
  }
}
