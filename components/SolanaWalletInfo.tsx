// components/SolanaWalletInfo.tsx
'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect } from 'react';

export function SolanaWalletInfo({ onAddressChange }: { onAddressChange: (address: string | null) => void }) {
  const { publicKey } = useWallet();
  
  useEffect(() => {
    if (publicKey) {
      onAddressChange(publicKey.toBase58());
    } else {
      onAddressChange(null);
    }
  }, [publicKey, onAddressChange]);
  
  return null;
}