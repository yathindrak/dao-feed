'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import { usePrivy } from '@privy-io/react-auth';

function LoadingSkeleton() {
  const skeletonActions = [
    'title-skeleton',
    'algorithm-skeleton',
    'essay-skeleton',
    'weather-skeleton',
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-2 w-full">
      {skeletonActions.map((id, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={id}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <div className="border rounded-xl px-4 py-3.5 flex flex-col gap-2 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded-md dark:bg-zinc-800" />
            <div className="h-4 w-32 bg-muted/60 rounded-md dark:bg-zinc-700" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface SuggestedActionsProps {
  chatId: string;
  append: UseChatHelpers['append'];
  walletAddress: string;
}

function PureSuggestedActions({
  chatId,
  append,
  walletAddress,
}: SuggestedActionsProps) {
  const { authenticated, login, ready } = usePrivy();

  if (!ready) {
    return <LoadingSkeleton />;
  }

  const handleAction = (message: string) => {
    if (!authenticated) {
      login();
      return;
    }
    append(
      {
        role: 'user',
        content: message,
      },
      {
        headers: {
          'x-privy-address': walletAddress,
        },
      },
    );
  };

  const suggestedActions = [
    {
      title: 'What are the advantages',
      label: 'of using Next.js?',
      action: 'What are the advantages of using Next.js?',
    },
    {
      title: 'Write code to',
      label: `demonstrate djikstra's algorithm`,
      action: `Write code to demonstrate djikstra's algorithm`,
    },
    {
      title: 'Help me write an essay',
      label: `about silicon valley`,
      action: `Help me write an essay about silicon valley`,
    },
    {
      title: 'What is the weather',
      label: 'in San Francisco?',
      action: 'What is the weather in San Francisco?',
    },
  ];

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-2 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className={index > 1 ? 'hidden sm:block' : 'block'}
        >
          <Button
            variant="ghost"
            onClick={() => handleAction(suggestedAction.action)}
            className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
          >
            <span className="font-medium">{suggestedAction.title}</span>
            <span className="text-muted-foreground">
              {suggestedAction.label}
            </span>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
