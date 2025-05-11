import { AgentKit } from '@coinbase/agentkit';
import { getVercelAITools } from '@coinbase/agentkit-vercel-ai-sdk';
import { base, baseSepolia, type Chain } from 'viem/chains';
import { snapshotActionProvider } from '@/agentkit-action-providers/snapshot/snapshotActionProvider';

export const SUPPORTED_NETWORKS: Chain[] = [base, baseSepolia];

export const DEFAULT_NETWORK = base;

/**
 * Initialize the agent with CDP Agentkit and Vercel AI SDK tools
 *
 * @returns Object containing initialized tools
 * @throws Error if initialization fails
 */
export async function initializeAgent(userAddress?: string) {
  try {
    const agentKit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
      actionProviders: [snapshotActionProvider(userAddress)],
    });

    const tools = getVercelAITools(agentKit);
    return { tools };
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    throw error;
  }
}
