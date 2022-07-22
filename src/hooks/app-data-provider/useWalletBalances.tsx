import { API_ETH_MOCK_ADDRESS } from '@aave/contract-helpers';
import { nativeToUSD, normalize, USD_DECIMALS } from '@aave/math-utils';
import { BigNumber } from 'bignumber.js';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { useRootStore } from 'src/store/root';

import { useProtocolDataContext } from '../useProtocolDataContext';

export interface WalletBalance {
  address: string;
  amount: string;
}

// allow fetching single wallet balance
// export const useWalletBalance = (chainId: number, address = '') => {
//   const { cache } = useApolloClient();
//   const balance = cache.readFragment<WalletBalance>({
//     id: `WalletBalance:${chainId}_${address.toLowerCase()}`,
//     fragment: gql`
//       fragment Balance on WalletBalance {
//         id @client
//         address @client
//         amount @client
//       }
//     `,
//   });
//   return balance;
// };

export const useWalletBalances = () => {
  const { currentAccount } = useWeb3Context();
  const { currentChainId, currentNetworkConfig } = useProtocolDataContext();
  const [balances, _reserves] = useRootStore((state) => [
    state.walletBalances?.[currentAccount]?.[currentChainId],
    state.reserves,
  ]);

  // process data
  const walletBalances = balances || [];
  const reserves = _reserves?.reservesData || [];
  const baseCurrencyData = _reserves?.baseCurrencyData || {
    marketReferenceCurrencyDecimals: 0,
    marketReferenceCurrencyPriceInUsd: '0',
    networkBaseTokenPriceInUsd: '0',
    networkBaseTokenPriceDecimals: 0,
  };
  let hasEmptyWallet = true;
  const aggregatedBalance = walletBalances.reduce((acc, reserve) => {
    const poolReserve = reserves.find((poolReserve) => {
      if (reserve.address === API_ETH_MOCK_ADDRESS.toLowerCase()) {
        return (
          poolReserve.symbol.toLowerCase() ===
          currentNetworkConfig.wrappedBaseAssetSymbol?.toLowerCase()
        );
      }
      return poolReserve.underlyingAsset.toLowerCase() === reserve.address;
    });
    if (reserve.amount !== '0') hasEmptyWallet = false;
    if (poolReserve) {
      acc[reserve.address] = {
        amount: normalize(reserve.amount, poolReserve.decimals),
        amountUSD: nativeToUSD({
          amount: new BigNumber(reserve.amount),
          currencyDecimals: poolReserve.decimals,
          priceInMarketReferenceCurrency: poolReserve.priceInMarketReferenceCurrency,
          marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
          normalizedMarketReferencePriceInUsd: normalize(
            baseCurrencyData.marketReferenceCurrencyPriceInUsd,
            USD_DECIMALS
          ),
        }),
      };
    }
    return acc;
  }, {} as { [address: string]: { amount: string; amountUSD: string } });
  return {
    walletBalances: aggregatedBalance,
    hasEmptyWallet,
    loading: !walletBalances.length || !reserves.length,
  };
};
