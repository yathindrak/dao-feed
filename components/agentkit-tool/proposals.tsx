import React from 'react';
import { Card } from '@/components/ui/card';
import type {
  ProposalsResult,
  SnapshotProposal,
  CoverageResult,
} from '@/agentkit-action-providers/snapshot/types';

interface Props {
  result: string;
}

const Proposals: React.FC<Props> = ({ result }) => {
  console.log('proposals component called');
  let body: any;
  try {
    body = JSON.parse(result);
  } catch {
    return <div className="text-red-500">Invalid result format</div>;
  }

  console.log('body', body);

  // Handle new structure for get_new_unaddressed_proposals
  if ('following' in body || 'memberOf' in body) {
    const following = body.following || [];
    const memberOf = body.memberOf || [];
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-semibold mb-2">Following Spaces</h3>
          {following.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {following.map((proposal: SnapshotProposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">
              No proposals in following spaces.
            </div>
          )}
        </div>
        <div>
          <h3 className="font-semibold mb-2">Member Of Spaces</h3>
          {memberOf.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {memberOf.map((proposal: SnapshotProposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">
              No proposals in member of spaces.
            </div>
          )}
        </div>
      </div>
    );
  }

  if ('proposals' in body) {
    if (!body.proposals.length) {
      return (
        <div className="text-muted-foreground">
          No proposals found for this period.
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {body.proposals.map((proposal: SnapshotProposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} />
        ))}
      </div>
    );
  }

  if ('percentage' in body) {
    return (
      <Card className="flex flex-col items-center justify-center p-6 gap-2">
        <p className="text-lg font-semibold">Coverage Percentage</p>
        <div className="w-full flex flex-col items-center">
          <span className="text-4xl font-bold text-primary">
            {body.percentage.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
            %
          </span>
        </div>
      </Card>
    );
  }

  return <div className="text-red-500">Unknown result type</div>;
};

const ProposalCard = ({ proposal }: { proposal: SnapshotProposal }) => {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-row items-center gap-2">
        <div className="flex-1">
          <p className="text-md font-bold line-clamp-2">{proposal.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">
            {proposal.state} &middot;{' '}
            {new Date(proposal.createdAt).toLocaleString()}
          </p>
        </div>
        <span className="rounded px-2 py-1 text-xs bg-muted text-muted-foreground">
          {proposal.choices.length} choices
        </span>
      </div>
      {proposal.body && (
        <p className="text-xs text-muted-foreground line-clamp-3">
          {proposal.body}
        </p>
      )}
      <div className="flex flex-row gap-2 text-xs text-muted-foreground">
        <span>Start: {new Date(proposal.start).toLocaleDateString()}</span>
        <span>End: {new Date(proposal.end).toLocaleDateString()}</span>
      </div>
    </Card>
  );
};

export default Proposals;
