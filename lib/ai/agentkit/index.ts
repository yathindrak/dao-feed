import { AgentKit } from '@coinbase/agentkit';
import { getVercelAITools } from '@coinbase/agentkit-vercel-ai-sdk';
// import { getVercelAITools } from './get-vercel-ai-tools';
import { moralisActionProvider } from '@/agentkit-action-providers/moralis';
import { base, baseSepolia, type Chain } from 'viem/chains';

export const SUPPORTED_NETWORKS: Chain[] = [base, baseSepolia];

export const DEFAULT_NETWORK = base;

/**
 * Initialize the agent with CDP Agentkit and Vercel AI SDK tools
 *
 * @returns Object containing initialized tools
 * @throws Error if initialization fails
 */
export async function initializeAgent() {
  try {
    const agentKit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
      actionProviders: [
        ...(process.env.MORALIS_API_KEY
          ? [moralisActionProvider(process.env.MORALIS_API_KEY)]
          : []),
      ],
    });

    const tools = getVercelAITools(agentKit);
    return { tools };
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    throw error;
  }
}
