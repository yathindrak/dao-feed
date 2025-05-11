'use client';

import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Markdown } from '@/components/markdown';
import { getToolInfo } from '@/lib/ai/agentkit/tool-info';
import type { ToolInvocation } from 'ai';
import { AnimatedShinyText } from '../ui/animated-shiny-text';
import Proposals from './proposals';

interface Props {
  toolInvocation: ToolInvocation;
}

const getDefaultOpenState = (toolName: string) => {
  return ['get_token_balances'].includes(toolName);
};

const AgentkitTool: React.FC<Props> = ({ toolInvocation }) => {
  const { toolName, toolCallId, state } = toolInvocation;

  const parsedToolName = toolName.slice(toolName.indexOf('_') + 1);

  const toolInfo = getToolInfo(parsedToolName);

  if (state === 'result') {
    const { result } = toolInvocation;

    return (
      <Collapsible
        key={toolCallId}
        defaultOpen={getDefaultOpenState(parsedToolName)}
        className="flex flex-col gap-2"
      >
        <CollapsibleTrigger className="flex flex-row items-center gap-2">
          {toolInfo?.icon}
          <p>{toolInfo?.title || toolName}</p>
          <ChevronDown className="size-4 transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          {[
            'get_created_proposals',
            'get_new_unaddressed_proposals',
            'get_addressed_proposals',
          ].includes(parsedToolName) ? (
            <Proposals result={result} />
          ) : (
            <Markdown>{result}</Markdown>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div key={toolCallId}>
      {toolInfo ? (
        <div className="flex flex-row items-center gap-2">
          {toolInfo.icon}
          <AnimatedShinyText className="text-md">
            {toolInfo.loading}
          </AnimatedShinyText>
        </div>
      ) : (
        <p>{toolName}</p>
      )}
    </div>
  );
};

export default AgentkitTool;
