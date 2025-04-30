'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
// import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets';

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not defined');
  }

  return (
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
      }}
    >
      {/* <SmartWalletsProvider> */}
      {children}
      {/* </SmartWalletsProvider> */}
    </PrivyProvider>
  );
}
