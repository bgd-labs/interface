/* eslint-disable @typescript-eslint/ban-ts-comment */
import { JsonRpcProvider } from '@ethersproject/providers';
import axios from 'axios';
import { getDefaultProvider, Contract, utils } from 'ethers';
import ERC20_ABI from '../../fixtures/erc20_abi.json';
import POOL_CONFIG_ABI from '../../fixtures/poolConfig.json';
import { IERC20Detailed } from '@aave/contract-helpers/src/erc20-contract/typechain/IERC20Detailed';

const TENDERLY_KEY = Cypress.env('TENDERLY_KEY');
const TENDERLY_ACCOUNT = Cypress.env('TENDERLY_ACCOUNT');
const TENDERLY_PROJECT = Cypress.env('TENDERLY_PROJECT');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('request');

export const DEFAULT_TEST_ACCOUNT = {
  privateKey: '2ab22efc6bc85a9cd2d6281416500d8523ba57206d94cb333cbd09977ca75479',
  address: '0x38F217d0762F28c806BD32cFEC5984385Fed97cB'.toLowerCase(),
};

const tenderly = axios.create({
  baseURL: 'https://api.tenderly.co/api/v1/',
  headers: {
    'X-Access-Key': TENDERLY_KEY,
  },
});

export class TenderlyFork {
  public _forkNetworkID: string;
  public _chainID: number;
  private fork_id?: string;

  constructor({ forkNetworkID }: { forkNetworkID: number }) {
    this._forkNetworkID = forkNetworkID.toString();
    this._chainID = 3030;
  }

  async init() {
    const response = await tenderly.post(
      `account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/fork`,
      {
        network_id: this._forkNetworkID,
        chain_config: { chain_id: this._chainID },
      }
    );
    this.fork_id = response.data.simulation_fork.id;
  }

  get_rpc_url() {
    if (!this.fork_id) throw new Error('Fork not initialized!');
    return `https://rpc.tenderly.co/fork/${this.fork_id}`;
  }

  async add_balance(address: string, amount: number) {
    if (!this.fork_id) throw new Error('Fork not initialized!');
    tenderly.post(
      `account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/fork/${this.fork_id}/balance`,
      { accounts: [address], amount: amount }
    );
  }

  async add_balance_rpc(address: string) {
    if (!this.fork_id) throw new Error('Fork not initialized!');
    const options = {
      url: this.get_rpc_url(),
      method: 'post',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tenderly_setBalance',
        params: [address, '0x21e19e0c9bab2400000'],
        id: '1234',
      }),
    };
    request(options);
  }

  async unpauseMarket(): Promise<void> {
    const _url = this.get_rpc_url();
    const provider = new JsonRpcProvider(_url);
    const emergencyAdmin = '0x4365F8e70CF38C6cA67DE41448508F2da8825500';
    const signer = await provider.getSigner(emergencyAdmin);
    // constant addresses:

    const poolConfigurator = new Contract(
      '0x8145eddDf43f50276641b55bd3AD95944510021E',
      POOL_CONFIG_ABI,
      signer
    );

    await poolConfigurator.setPoolPause(false, { from: signer._address, gasLimit: '4000000' });
    return;
  }

  async getERC20Token(walletAddress: string, tokenAddress: string) {
    const _url = this.get_rpc_url();
    const provider = getDefaultProvider(_url);
    const TOP_HOLDER_ADDRESS = await this.getTopHolder(tokenAddress);
    // @ts-ignore
    const topHolderSigner = await provider.getSigner(TOP_HOLDER_ADDRESS);
    const token = new Contract(tokenAddress, ERC20_ABI, topHolderSigner);
    await token.transfer(walletAddress, utils.parseEther('1000'));
  }

  async getTopHolder(token: string) {
    const res = (
      await axios.get(
        `https://ethplorer.io/service/service.php?data=${token}&page=tab%3Dtab-holders%26pageSize%3D10%26holders%3D1`
      )
    ).data.holders[0].address;
    return res;
  }

  async getOptimismTokens() {
    const amount = 1000;
    const token = '0x4200000000000000000000000000000000000006'; // weth
    const decimals = await (
      (await getContract(
        '@aave/protocol-v2/contracts/dependencies/openzeppelin/contracts/IERC20Detailed.sol:IERC20Detailed',
        token
      )) as IERC20Detailed
    ).decimals();
    const rawAmount = parseUnits(amount, decimals);
    const slotValue = abiEncode(['uint'], [rawAmount.toString()]);

    const balanceSlot = await findBalancesSlot(token);
    let accountSlotLocation = hre.ethers.utils.keccak256(
      abiEncode(['address', 'uint'], [user, balanceSlot])
    );

    // remove padding for JSON RPC
    while (accountSlotLocation.startsWith('0x0'))
      accountSlotLocation = '0x' + accountSlotLocation.slice(3);

    await hre.network.provider.send('hardhat_setStorageAt', [
      token,
      accountSlotLocation,
      slotValue,
    ]);
  }

  async deleteFork() {
    await tenderly.delete(
      `account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/fork/${this.fork_id}`
    );
  }
}
