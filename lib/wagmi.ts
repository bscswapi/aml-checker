// lib/wagmi.ts
import { configureChains, createConfig } from 'wagmi';
import { mainnet, bsc, base } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';
import { getDefaultWallets } from '@rainbow-me/rainbowkit';

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [mainnet, bsc, base],
  [publicProvider()]
);

const { connectors } = getDefaultWallets({
  appName: 'AML Checker',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains,
});

export const config = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
});

export { chains };