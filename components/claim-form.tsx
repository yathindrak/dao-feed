'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface ClaimData {
  id: string;
  claimedAt: string;
  amount: string;
  currency: string;
}

interface ClaimFormProps {
  pool: {
    year: string;
    month: string;
    amount: string;
    currency: string;
  };
}

// Helper to format ETH amounts with up to 6 decimals
function formatEthAmount(amount: string | number, decimals = 6) {
  const num = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (num === 0) return '0';
  if (num < Math.pow(10, -decimals))
    return `< ${'0.'.padEnd(decimals + 2, '0')}1`;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

export function ClaimForm({ pool }: ClaimFormProps) {
  const { authenticated, login, user } = usePrivy();
  const [contributionPercent, setContributionPercent] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [rewardAmount, setRewardAmount] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Format the month name for display
  const monthName = format(
    new Date(Number(pool.year), Number(pool.month) - 1),
    'MMMM yyyy',
  );

  useEffect(() => {
    const fetchUserContribution = async () => {
      if (!authenticated || !user?.wallet?.address) return;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/user-contribution?address=${user.wallet.address}`,
        );
        if (response.ok) {
          const data = await response.json();
          setContributionPercent(data.contributionPercent || '0');
          setClaimed(data.claimed || false);
          setClaimData(data.claimData);
          // Calculate reward amount based on contribution percentage
          const percent = Number.parseFloat(data.contributionPercent || '0');
          const poolAmount = Number.parseFloat(pool.amount);
          const reward = (percent * poolAmount).toFixed(6);

          setRewardAmount(reward);
        } else {
          setContributionPercent('0');
          setRewardAmount('0');
          setClaimed(false);
          setClaimData(null);
        }
      } catch (error) {
        setContributionPercent('0');
        setRewardAmount('0');
        setClaimed(false);
        setClaimData(null);
        setError('Failed to fetch contribution data');
      } finally {
        setLoading(false);
      }
    };
    fetchUserContribution();
  }, [authenticated, user?.wallet?.address, pool]);

  const handleClaimClick = async () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!user?.wallet?.address || !rewardAmount || Number(rewardAmount) <= 0)
      return;
    setClaiming(true);
    setError(null);
    try {
      const response = await fetch('/api/claim-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: user.wallet.address }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Failed to claim reward');
      setClaimed(true);
      setClaimData({
        id: result.data.id,
        claimedAt: result.data.claimedAt,
        amount: result.data.amount,
        currency: result.data.currency,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to claim reward',
      );
    } finally {
      setClaiming(false);
    }
  };

  const formattedContribution = contributionPercent
    ? `${(Number.parseFloat(contributionPercent) * 100).toFixed(2)}%`
    : '--';

  const renderClaimState = () => {
    if (claimed && claimData) {
      return (
        <div className="mt-4 mb-2">
          <Alert className="bg-green-900/30 border-green-800">
            <Badge className="mb-2 bg-green-700">Claimed</Badge>
            <AlertTitle className="text-green-400">
              {`${Number(claimData.amount).toLocaleString()} ${claimData.currency} Claimed`}
            </AlertTitle>
            <AlertDescription className="text-sm text-gray-400 mt-1">
              Claimed on {format(new Date(claimData.claimedAt), 'MMM d, yyyy')}
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    if (error) {
      return (
        <div className="mt-4 mb-2">
          <Alert className="bg-red-900/30 border-red-800">
            <AlertTitle className="text-red-400">Error</AlertTitle>
            <AlertDescription className="text-sm text-gray-300">
              {error}
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-md mx-auto bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-medium">Available Rewards</h2>
        <Badge className="px-3 py-1">{monthName}</Badge>
      </div>

      {renderClaimState()}

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Pool Amount</span>
          <span className="font-medium text-lg">
            {`${Number(pool.amount).toLocaleString()} ${pool.currency}`}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400">Your Contribution</span>
          <span className="font-medium text-lg">
            {loading ? '...' : formattedContribution}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-gray-400">Your Reward</span>
          <span className="font-medium text-xl text-green-400">
            {loading ? (
              '...'
            ) : rewardAmount ? (
              <span title={rewardAmount} style={{ fontFamily: 'monospace' }}>
                {formatEthAmount(rewardAmount, 6)} {pool.currency}
              </span>
            ) : (
              '--'
            )}
          </span>
        </div>

        <div className="pt-4">
          <Button
            className="w-full py-6"
            size="lg"
            onClick={handleClaimClick}
            disabled={
              loading ||
              claiming ||
              !authenticated ||
              !rewardAmount ||
              Number(rewardAmount) <= 0 ||
              claimed
            }
          >
            {!authenticated
              ? 'Connect Wallet to Claim'
              : claimed
                ? 'Already Claimed'
                : claiming
                  ? 'Processing...'
                  : 'Claim Rewards'}
          </Button>
        </div>

        <p className="text-xs text-center text-gray-500 mt-2">
          Rewards are distributed based on your contribution percentage to DAO
          governance
        </p>
      </div>
    </div>
  );
}
