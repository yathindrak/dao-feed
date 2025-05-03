import type { z } from 'zod';
import Moralis from 'moralis';

import {
  ActionProvider,
  CreateAction,
  type EvmWalletProvider,
} from '@coinbase/agentkit';
import { GetTokenBalancesSchema } from './schemas';

export interface Network {
  /**
   * The protocol family of the network.
   */
  protocolFamily: string;

  /**
   * The network ID of the network.
   */
  networkId?: string;

  /**
   * The chain ID of the network.
   */
  chainId?: string;
}

/**
 * MoralisActionProvider is an action provider for Moralis data.
 */
export class MoralisActionProvider extends ActionProvider<EvmWalletProvider> {
  private moralisApiKey: string;

  /**
   * Constructor for the MoralisActionProvider class.
   */
  constructor(apiKey: string) {
    super('moralis', []);
    this.moralisApiKey = apiKey;
  }

  supportsNetwork(network: Network): boolean {
    return true;
  }

  /**
   * Gets the balance of an ERC20 token.
   *
   * @param walletProvider - The wallet provider to get the balance from.
   * @param args - The input arguments for the action.
   * @returns A message containing the balance.
   */
  @CreateAction({
    name: 'get_token_balances',
    description: `This tool will get the token balances of the agent wallet.`,
    schema: GetTokenBalancesSchema,
  })
  async getTokenBalances(
    wallet: EvmWalletProvider,
    args: z.infer<typeof GetTokenBalancesSchema>,
  ): Promise<string> {
    if (!wallet) {
      throw new Error('Wallet provider is required');
    }

    try {
      if (!Moralis.Core.isStarted) {
        await Moralis.start({
          apiKey: this.moralisApiKey,
        });
      }

      const address = '0xf8361dcc7be8d22c672a4fbbbe9997a372b9d7cd';
      // await wallet.getAddress();
      if (!address) {
        throw new Error('Failed to get wallet address');
      }

      const response = await Moralis.EvmApi.wallets.getWalletTokenBalancesPrice(
        {
          chain: Moralis.EvmUtils.EvmChain.BASE,
          address,
        },
      );

      return JSON.stringify({
        tokens: response.result.filter((token) => token.usdValue !== null),
        message:
          'The user is shown the tokens in the UI. DO NOT reiterate the tokens in your return message. Ask the user what they want to do next.',
      });
    } catch (error) {
      console.error('Error in getTokenBalances:', error);
      throw new Error(`Error fetching token balances: ${error}`);
    }
  }
}

export const moralisActionProvider = (apiKey: string) =>
  new MoralisActionProvider(apiKey);
