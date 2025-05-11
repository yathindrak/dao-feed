'use client';

import type { UIMessage } from 'ai';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import AgentkitTool from './agentkit-tool';
import type { SnapshotProposal } from '@/agentkit-action-providers/snapshot/types';
import { ExternalLinkIcon } from '@radix-ui/react-icons';

const Proposals = ({ result }: { result: string }) => {
  let body: any;
  try {
    body = JSON.parse(result);
  } catch {
    return <div className="text-red-500">Invalid result format</div>;
  }

  console.log({ body });

  // Check if the body is an object and has 'proposals' key (for get_created_proposals)
  if (
    body &&
    typeof body === 'object' &&
    'proposals' in body &&
    !('following' in body) &&
    !('memberOf' in body)
  ) {
    const proposalsArray = body.proposals as SnapshotProposal[];
    if (!proposalsArray || proposalsArray.length === 0) {
      return <div className="text-muted-foreground">No proposals found.</div>;
    }
    return (
      <div className="flex flex-col gap-6 my-4">
        <ProposalGroup title="CREATED PROPOSALS" proposals={proposalsArray} />
      </div>
    );
  }

  if (!('following' in body) && !('memberOf' in body)) {
    return <div className="text-muted-foreground">No proposals found.</div>;
  }
  return (
    <div className="flex flex-col gap-6 my-4">
      <ProposalGroup
        title="FOLLOWING SPACES"
        proposals={body.following || []}
      />
      <ProposalGroup title="MEMBER OF SPACES" proposals={body.memberOf || []} />
    </div>
  );
};

const ProposalGroup = ({
  title,
  proposals,
}: {
  title: string;
  proposals: SnapshotProposal[];
}) => (
  <section className="w-full">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
      {title}
    </h3>
    {proposals.length ? (
      <div className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <CollapsibleProposalCard key={proposal.id} proposal={proposal} />
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground px-1">
        No proposals in this group.
      </p>
    )}
  </section>
);

const CollapsibleProposalCard = ({
  proposal,
}: { proposal: SnapshotProposal }) => {
  const [open, setOpen] = useState(false);

  const MetadataItem = ({
    label,
    value,
  }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'px-2.5 py-0.5 text-xs font-medium tracking-wide rounded-full',
          'text-muted-foreground bg-muted',
        )}
      >
        {label}
      </span>
      <p
        className="font-medium text-foreground text-sm truncate"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
    </div>
  );

  const proposalUrl = `https://snapshot.box/#/s:${proposal.spaceId}/proposal/${proposal.id}`;

  return (
    <div
      className="w-full rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md relative"
      tabIndex={-1}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        tabIndex={0}
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="flex-grow">
            <h4 className="text-base font-semibold leading-tight text-foreground">
              {proposal.title}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Space: <span className="font-medium">{proposal.spaceId}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={proposalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 border border-border rounded-md hover:bg-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="View proposal on Snapshot"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
            <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded-md whitespace-nowrap">
              {proposal.choices.length} choices
            </span>
          </div>
        </div>

        <hr className="border-border/60 my-3" />

        <div className="flex flex-col gap-2.5 text-sm">
          <span
            className={cn(
              'px-2.5 py-0.5 text-xs font-medium tracking-wide rounded-full w-fit',
              proposal.state.toLowerCase() === 'active'
                ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-100'
                : 'text-muted-foreground bg-muted',
            )}
          >
            {proposal.state?.toUpperCase()}
          </span>
          <MetadataItem
            label="Created"
            value={new Date(proposal.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          />
          <MetadataItem
            label="Timeline"
            value={
              <span className="flex items-center">
                {new Date(proposal.start).toLocaleDateString()}
                <span className="mx-1.5">→</span>
                {new Date(proposal.end).toLocaleDateString()}
              </span>
            }
          />
        </div>

        {proposal.body && (
          <>
            <hr className="border-border/60 my-3" />
            <div>
              <button
                type="button"
                className="text-xs text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((v) => !v);
                }}
              >
                {open ? 'Hide Description' : 'Show Description'}
              </button>
            </div>
          </>
        )}
      </div>

      {open && proposal.body && (
        <div className="border-t border-border/60">
          <div className="px-4 py-3 text-sm text-muted-foreground whitespace-pre-line">
            {proposal.body}
          </div>
        </div>
      )}
    </div>
  );
};

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  isReadonly,
}: {
  chatId: string;
  message: UIMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  isReadonly: boolean;
}) => {
  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:w-fit'
          }
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'text') {
                return (
                  <div key={key} className="flex flex-row gap-2 items-start">
                    <div
                      data-testid="message-content"
                      className={cn('flex flex-col gap-4', {
                        'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                          message.role === 'user',
                      })}
                    >
                      <Markdown>{part.text}</Markdown>
                    </div>
                  </div>
                );
              }

              if (type === 'tool-invocation') {
                const { toolInvocation } = part;
                const { toolName, toolCallId, state } = toolInvocation;

                if (toolName === 'getWeather') {
                  if (state === 'call') {
                    return (
                      <div key={toolCallId} className="skeleton">
                        <Weather />
                      </div>
                    );
                  }
                  if (state === 'result') {
                    return (
                      <div key={toolCallId}>
                        <Weather weatherAtLocation={toolInvocation.result} />
                      </div>
                    );
                  }
                }

                if (
                  [
                    'get_created_proposals',
                    'get_new_unaddressed_proposals',
                    'get_addressed_proposals',
                  ].includes(toolName.slice(toolName.indexOf('_') + 1)) &&
                  state === 'result'
                ) {
                  return (
                    <Proposals
                      key={toolCallId}
                      result={toolInvocation.result}
                    />
                  );
                }

                return (
                  <AgentkitTool
                    key={toolCallId}
                    toolInvocation={toolInvocation}
                  />
                );
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message "
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
