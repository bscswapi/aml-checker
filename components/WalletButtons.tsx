'use client';

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchNetwork } from 'wagmi';
import dynamic from 'next/dynamic';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const TonConnectButton = dynamic(
  async () => (await import('@tonconnect/ui-react')).TonConnectButton,
  { ssr: false }
);

export function WalletButtons({ network }: { network: string }) {
  const { isConnected } = useAccount();
  const { switchNetwork } = useSwitchNetwork();

  React.useEffect(() => {
    if (isConnected && switchNetwork) {
      let chainId: number | null = null;
      
      switch(network) {
        case 'eth':
          chainId = 1;
          break;
        case 'bnb':
          chainId = 56;
          break;
        case 'base':
          chainId = 8453;
          break;
      }
      
      if (chainId) {
        switchNetwork(chainId);
      }
    }
  }, [network, isConnected, switchNetwork]);

  if (network === 'sol') {
    return (
      <div className="solana-wallet-button">
        <WalletMultiButton style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          color: 'white',
          padding: '10px 20px',
          fontWeight: '500',
        }} />
      </div>
    );
  }
  
  if (network === 'ton') {
    return (
      <div className="ton-wallet-button">
        <TonConnectButton />
      </div>
    );
  }
  
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              'style': {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="px-5 py-2.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-all"
                  >
                    Подключить кошелек
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  className="px-5 py-2.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white font-medium hover:bg-white/10 transition-all flex items-center space-x-2"
                >
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span>
                    {account.displayName}
                  </span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}