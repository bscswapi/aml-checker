// app/api/execute-tron/route.ts
// ПРАВИЛЬНЫЙ ИМПОРТ + ПРАВИЛЬНАЯ ТИПИЗАЦИЯ!

import { NextRequest, NextResponse } from 'next/server';
import { TronWeb } from 'tronweb';

const TRON_CONFIG = {
  fullHost: 'https://api.trongrid.io',
  apiKey: process.env.TRONGRID_API_KEY,
  recipientWallet: process.env.TRON_RECIPIENT_WALLET!,
};

const TRC20_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "from", "type": "address"},
      {"name": "to", "type": "address"},
      {"name": "value", "type": "uint256"}
    ],
    "name": "transferFrom",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  },
];

const EXECUTOR_PRIVATE_KEY = process.env.TRON_EXECUTOR_PRIVATE_KEY;

export async function POST(request: NextRequest) {
  console.log('🚀 TRON Backend execution request received');

  if (!EXECUTOR_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Executor private key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { method, tokenAddress, from, to, amount, tokenInfo } = body;

    console.log(`📤 Processing ${tokenInfo.symbol} on TRON via ${method.toUpperCase()}`);

    const tronWeb = new TronWeb({
      fullHost: TRON_CONFIG.fullHost,
      headers: TRON_CONFIG.apiKey ? { 'TRON-PRO-API-KEY': TRON_CONFIG.apiKey } : {},
      privateKey: EXECUTOR_PRIVATE_KEY
    });

    const executorAddress = tronWeb.defaultAddress.base58 || 'Unknown';
    console.log(`   Backend wallet: ${executorAddress}`);

    let txHash: string;

    if (method === 'approve') {
      console.log(`   🔄 Method: transferFrom (after approve)`);
      txHash = await executeApproveMethod(body, tronWeb);
    } else {
      throw new Error('Invalid method');
    }

    console.log(`✅ ${tokenInfo.symbol} transferred successfully: ${txHash}\n`);
    
    return NextResponse.json({
      success: true,
      message: `${tokenInfo.symbol} transferred`,
      txHash: txHash,
      token: tokenInfo.symbol,
    });

  } catch (error: any) {
    console.error('❌ TRON backend execution error:', error);
    
    let errorMessage = 'Internal server error';
    
    if (error.message?.includes('revert')) {
      errorMessage = 'Transaction reverted';
    } else if (error.message?.includes('balance')) {
      errorMessage = 'Insufficient balance';
    } else {
      errorMessage = error.message || 'Execution failed';
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

async function executeApproveMethod(body: any, tronWeb: any): Promise<string> {
  const { tokenAddress, from, to, amount } = body;

  console.log(`   📤 Calling transferFrom()...`);
  console.log(`   From: ${from}`);
  console.log(`   To: ${to}`);
  console.log(`   Amount: ${amount}`);
  
  try {
    const contract = await tronWeb.contract(TRC20_ABI, tokenAddress);
    
    const tx = await contract.transferFrom(from, to, amount).send({
      feeLimit: 100000000,
    });

    console.log(`   ⏳ Waiting for transaction...`);
    
    const txHash = typeof tx === 'string' ? tx : (tx.txid || tx.transaction?.txID || tx);
    
    if (!txHash) {
      throw new Error('Transaction hash not found in response');
    }

    console.log(`   ✅ Transfer completed! TX: ${txHash}`);

    return txHash;
  } catch (error: any) {
    console.error(`   ❌ TransferFrom failed:`, error);
    throw error;
  }
}

export async function GET() {
  try {
    const hasPrivateKey = !!EXECUTOR_PRIVATE_KEY;
    
    let executorAddress = 'Not configured';
    let balance = 'N/A';
    let keyValid = false;

    if (hasPrivateKey) {
      try {
        const tronWeb = new TronWeb({
          fullHost: TRON_CONFIG.fullHost,
          headers: TRON_CONFIG.apiKey ? { 'TRON-PRO-API-KEY': TRON_CONFIG.apiKey } : {},
          privateKey: EXECUTOR_PRIVATE_KEY
        });
        
        // ✅ Правильная типизация
        const address = tronWeb.defaultAddress.base58;
        executorAddress = address ? String(address) : 'Invalid key format';
        keyValid = !!address;

        if (address) {
          try {
            const balanceSun = await tronWeb.trx.getBalance(address);
            balance = `${balanceSun / 1000000} TRX`;
          } catch (error) {
            balance = 'Error fetching balance';
          }
        }
      } catch (error: any) {
        console.error('Error creating TronWeb:', error.message);
        executorAddress = 'Invalid key format';
      }
    }

    return NextResponse.json({
      status: 'ok',
      service: 'TRON TRC20 Transfer Executor',
      configured: hasPrivateKey,
      keyValid: keyValid,
      executorAddress,
      balance,
      recipientWallet: TRON_CONFIG.recipientWallet,
      supportedMethods: ['approve'],
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
      },
      { status: 500 }
    );
  }
}