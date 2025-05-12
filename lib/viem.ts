import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

export const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.ALCHEMY_URL),
});
