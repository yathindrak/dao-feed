mport type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import {
  snapshotUserMonthlyActivity,
  userRewardClaim,
  snapshotPrizePool,
  user,
} from '@/lib/db/schema';
import { type Address, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ethers } from 'ethers';
import BuilderTokenArtifact from '../../contracts/DFToken#DFToken.json';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

const privateKey = process.env.REWARD_WALLET_PRIVATE_KEY;
const rpcUrl = process.env.ALCHEMY_URL;
const BUILDER_TOKEN_ADDRESS = '0x2c769Ea687483e46876dbC3faD6eaE5B78442F91';
if (!privateKey || !rpcUrl) {
  throw new Error('Reward wallet not configured');
}

const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

async function sendTransaction({
  privateKey,
  to,
  value,
  rpcUrl,
}: {
  privateKey: Address;
  to: Address;
  value: bigint;
  rpcUrl: string;
}) {
  try {
    if (process.env.PRIVATE_KEY) {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
      const dfToken = new ethers.Contract(
        BUILDER_TOKEN_ADDRESS,
        BuilderTokenArtifact.abi,
        wallet,
      );

      // Call the claim function with address and amount
      const tx = await dfToken.claim(to, value);
      const receipt = await tx.wait();
      return receipt.hash;
    }
  } catch (e: any) {
    if (e?.shortMessage?.includes('Account balance is too low')) {
      throw new Error('Insufficient funds on reward wallet.');
    }
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    if (!address) {
      return NextResponse.json(
        { error: 'Missing required parameter: address' },
        { status: 400 },
      );
    }

    // Check if user exists
    const userExists = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, address))
      .limit(1);

    if (userExists.length === 0) {
      // Insert user with minimal info (update as needed)
      await db.insert(user).values({
        id: address,
        email: '',
        address: address,
      });
    }

    // Get last month and year
    const now = new Date();
    let month = now.getUTCMonth(); // 0-11
    let year = now.getUTCFullYear();
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    // Check if already claimed
    const existingClaim = await db
      .select({ id: userRewardClaim.id })
      .from(userRewardClaim)
      .where(
        and(
          eq(userRewardClaim.userId, address),
          eq(userRewardClaim.year, yearStr),
          eq(userRewardClaim.month, monthStr),
        ),
      )
      .limit(1);

    if (existingClaim.length > 0) {
      return NextResponse.json(
        { error: 'Reward already claimed' },
        { status: 400 },
      );
    }

    // Get user's contribution percentage
    const userActivity = await db
      .select({
        contributionPercent: snapshotUserMonthlyActivity.contributionPercent,
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

    console.log({ userActivity });
    if (userActivity.length === 0 || !userActivity[0].contributionPercent) {
      return NextResponse.json(
        { error: 'No contribution found for this period' },
        { status: 400 },
      );
    }

    // Get prize pool
    const prizePool = await db
      .select({
        amount: snapshotPrizePool.amount,
        currency: snapshotPrizePool.currency,
      })
      .from(snapshotPrizePool)
      .where(
        and(
          eq(snapshotPrizePool.year, yearStr),
          eq(snapshotPrizePool.month, monthStr),
        ),
      )
      .limit(1);

    console.log({ prizePool });

    if (prizePool.length === 0) {
      return NextResponse.json(
        { error: 'No prize pool found for this period' },
        { status: 400 },
      );
    }

    // Calculate reward amount
    const contributionPercent = Number.parseFloat(
      userActivity[0].contributionPercent,
    );
    const poolAmount = Number.parseFloat(prizePool[0].amount.toString());
    const rewardAmount = (contributionPercent * poolAmount).toFixed(6);

    // Send ETH transfer
    let txHash = '';
    try {
      txHash = await sendTransaction({
        privateKey: privateKey as Address,
        to: address as Address,
        value: parseEther(rewardAmount),
        rpcUrl: rpcUrl as string,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e.message || 'Failed to send reward transaction' },
        { status: 500 },
      );
    }

    // Record the claim only if transfer succeeded
    const claimedAt = new Date();
    await db.insert(userRewardClaim).values({
      userId: address,
      year: yearStr,
      month: monthStr,
      amount: rewardAmount,
      currency: prizePool[0].currency,
      txHash,
      claimedAt,
    });

    return NextResponse.json({
      success: true,
      message: 'Reward claimed successfully',
      data: {
        userId: address,
        year: yearStr,
        month: monthStr,
        amount: rewardAmount,
        currency: prizePool[0].currency,
        txHash,
        claimedAt,
      },
    });
  } catch (error) {
    console.error('Error claiming reward:', error);
    return NextResponse.json(
      { error: 'Failed to claim reward' },
      { status: 500 },
    );
  }
}

