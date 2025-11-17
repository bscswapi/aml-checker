// components/TonWalletInfo.tsx
'use client';

import { useTonAddress } from '@tonconnect/ui-react';
import { useEffect } from 'react';

export function TonWalletInfo({ onAddressChange }: { onAddressChange: (address: string | null) => void }) {
  const address = useTonAddress();
  
  useEffect(() => {
    onAddressChange(address || null);
  }, [address, onAddressChange]);
  
  return null;
}