'use client';

import React from 'react';
import { WagmiConfig } from 'wagmi';
import { RainbowKitProvider, darkTheme, midnightTheme } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, chains } from '@/lib/wagmi';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

const queryClient = new QueryClient();

// Кастомная тема для RainbowKit
const customTheme = {
  ...midnightTheme(),
  colors: {
    ...midnightTheme().colors,
    modalBackground: 'rgba(0, 0, 0, 0.95)',
    modalBorder: 'rgba(255, 255, 255, 0.1)',
  },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  
  // Solana configuration
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = React.useMemo(() => clusterApiUrl(network), [network]);
  const wallets = React.useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );
  
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Показываем загрузчик вместо черного экрана
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          chains={chains}
          theme={customTheme}
          showRecentTransactions={false}
          modalSize="compact"
          appInfo={{
            appName: 'AML Checker',
          }}
        >
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false}>
              <WalletModalProvider>
                <TonConnectUIProvider manifestUrl="https://aml-checker-omega.vercel.app/tonconnect-manifest.json">
                  {children}
                </TonConnectUIProvider>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}