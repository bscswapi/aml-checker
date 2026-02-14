// app/TronProvider.tsx
'use client';

import React, { useMemo } from 'react';
import { WalletProvider } from '@tronweb3/tronwallet-adapter-react-hooks';
import { WalletModalProvider } from '@tronweb3/tronwallet-adapter-react-ui';
import {
  TronLinkAdapter,
  WalletConnectAdapter,
  LedgerAdapter,
  TokenPocketAdapter,
  BitKeepAdapter,
  OkxWalletAdapter,
} from '@tronweb3/tronwallet-adapters';

// Импортируй стили
import '@tronweb3/tronwallet-adapter-react-ui/style.css';

export function TronProvider({ children }: { children: React.ReactNode }) {
  const adapters = useMemo(() => {
    return [
      new TronLinkAdapter(),
      new TokenPocketAdapter(),
      new BitKeepAdapter(),
      new OkxWalletAdapter(),
      new WalletConnectAdapter({
        network: 'Mainnet',
        options: {
          relayUrl: 'wss://relay.walletconnect.com',
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
          metadata: {
            name: 'AML Checker',
            description: 'AML Verification System',
            url: 'https://your-site.com',
            icons: ['https://your-site.com/icon.png'],
          },
        },
      }),
      new LedgerAdapter({
        accountNumber: 0,
      }),
    ];
  }, []);

  return (
    <WalletProvider adapters={adapters} autoConnect={true}>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletProvider>
  );
}