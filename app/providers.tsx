'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { baseSepolia } from 'viem/chains';
import { http } from 'viem';

// import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';

const handleError = (error: Error | undefined) => {
  console.error(error);
};

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not defined');
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
      mutations: {
        // This way it's overrideable in useMutation hooks
        onError: handleError,
      },
    },
    queryCache: new QueryCache({
      onError: handleError,
    }),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={appId}
        config={{
          defaultChain: baseSepolia,
          supportedChains: [baseSepolia],
          appearance: {
            theme: 'dark',
            landingHeader: 'Sign in to your DAO Feed',
            accentColor: '#0f172a',
            logo: 'https://img.freepik.com/free-vector/butterfly-colorful-logo-template_361591-1587.jpg',
          },
          embeddedWallets: {
            priceDisplay: {
              primary: 'native-token',
              secondary: null,
            },
            createOnLogin: 'users-without-wallets',
            showWalletUIs: true,
          },
          // externalWallets: {
          //   coinbaseWallet: {
          //     connectionOptions: 'smartWalletOnly',
          //   },
          // },
        }}
      >
        <WagmiProvider config={wagmiConfig}>
          {/* <SmartWalletsProvider> */}
          {children}
          {/* </SmartWalletsProvider> */}
        </WagmiProvider>
      </PrivyProvider>
    </QueryClientProvider>
  );
}
