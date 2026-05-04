import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  StakeProgram,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Result, success, failure } from '../types/shared.js';
import { createLogger } from '../utils/logger.js';
import { getSolanaClient } from '../rpc/solana-client.js';
import type { StakingAdapter, StakingReward, WrapperAdapter } from './adapters.js';

const logger = createLogger('NATIVE_DEFI');

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function makeAuthorized(staker: PublicKey) {
  return {
    staker,
    withdrawer: staker,
  };
}

export class NativeStakeAdapter implements StakingAdapter {
  name = 'Native Stake';
  protocol = 'native' as const;

  async getValidators(): Promise<Result<StakingReward[], Error>> {
    try {
      if (!isProduction()) {
        return success([
          {
            validatorVoteAddress: 'Vote111111111111111111111111111111111111111',
            apr: 0.08,
            commission: 0,
            delegatedStake: 1_000_000 * LAMPORTS_PER_SOL,
            activatedEpoch: 0,
          },
        ]);
      }

      const connection = getSolanaClient().getConnection();
      const voteAccounts = await connection.getVoteAccounts();

      const validators: StakingReward[] = voteAccounts.current.slice(0, 25).map((account) => ({
        validatorVoteAddress: account.votePubkey,
        apr: 0.08,
        commission: account.commission,
        delegatedStake: account.activatedStake,
        activatedEpoch: 0,
      }));

      return success(validators);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async stake(params: {
    payer: PublicKey;
    validatorVoteAddress?: string;
    amount: number;
    delegateAtEpoch?: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      if (!params.validatorVoteAddress) {
        return failure(new Error('validatorVoteAddress is required for native staking'));
      }

      if (!isProduction()) {
        logger.warn('NativeStakeAdapter.stake using development fallback transaction');
        return success(new Transaction());
      }

      const connection = getSolanaClient().getConnection();
      const blockhashResult = await getSolanaClient().getRecentBlockhash();
      if (!blockhashResult.ok || !blockhashResult.value) {
        return failure(new Error('Failed to fetch recent blockhash'));
      }

      const stakeAccount = Keypair.generate();
      const rentExemptReserve = await connection.getMinimumBalanceForRentExemption(
        StakeProgram.space
      );
      const tx = StakeProgram.createAccount({
        fromPubkey: params.payer,
        stakePubkey: stakeAccount.publicKey,
        authorized: makeAuthorized(params.payer),
        lamports: rentExemptReserve + params.amount,
      });

      tx.recentBlockhash = blockhashResult.value;
      tx.feePayer = params.payer;
      tx.add(
        StakeProgram.delegate({
          stakePubkey: stakeAccount.publicKey,
          authorizedPubkey: params.payer,
          votePubkey: new PublicKey(params.validatorVoteAddress),
        })
      );
      tx.partialSign(stakeAccount);

      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async unstake(params: {
    payer: PublicKey;
    stakeAccountAddress: string;
    amount?: number;
    immediateUnstake?: boolean;
  }): Promise<Result<Transaction, Error>> {
    try {
      if (!isProduction()) {
        logger.warn('NativeStakeAdapter.unstake using development fallback transaction');
        return success(new Transaction());
      }

      const blockhashResult = await getSolanaClient().getRecentBlockhash();
      if (!blockhashResult.ok || !blockhashResult.value) {
        return failure(new Error('Failed to fetch recent blockhash'));
      }

      const tx = new Transaction({
        recentBlockhash: blockhashResult.value,
        feePayer: params.payer,
      });
      tx.add(
        StakeProgram.deactivate({
          stakePubkey: new PublicKey(params.stakeAccountAddress),
          authorizedPubkey: params.payer,
        })
      );

      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async deposit(params: { payer: PublicKey; amount: number }): Promise<Result<Transaction, Error>> {
    return this.stake({
      payer: params.payer,
      amount: params.amount,
      validatorVoteAddress: undefined,
    });
  }

  async withdraw(params: {
    payer: PublicKey;
    amount: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      if (!isProduction()) {
        logger.warn('NativeStakeAdapter.withdraw using development fallback transaction');
        return success(new Transaction());
      }

      const blockhashResult = await getSolanaClient().getRecentBlockhash();
      if (!blockhashResult.ok || !blockhashResult.value) {
        return failure(new Error('Failed to fetch recent blockhash'));
      }

      const tx = new Transaction({
        recentBlockhash: blockhashResult.value,
        feePayer: params.payer,
      });
      tx.add(
        StakeProgram.withdraw({
          stakePubkey: params.payer,
          authorizedPubkey: params.payer,
          toPubkey: params.payer,
          lamports: params.amount,
        })
      );

      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async getApy(): Promise<Result<number, Error>> {
    try {
      return success(0.08);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

export class NativeWrapperAdapter implements WrapperAdapter {
  name = 'Native Wrapper';
  protocol = 'native_wrapper' as const;

  async wrap(params: {
    payer: PublicKey;
    sourceMint: string;
    targetMint: string;
    amount: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      if (params.targetMint !== NATIVE_MINT.toBase58()) {
        return failure(new Error('Native wrapper only supports wrapping to wSOL'));
      }

      if (!isProduction()) {
        logger.warn('NativeWrapperAdapter.wrap using development fallback transaction');
        return success(new Transaction());
      }

      const connection = getSolanaClient().getConnection();
      const blockhashResult = await getSolanaClient().getRecentBlockhash();
      if (!blockhashResult.ok || !blockhashResult.value) {
        return failure(new Error('Failed to fetch recent blockhash'));
      }

      const ata = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        params.payer,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction({
        recentBlockhash: blockhashResult.value,
        feePayer: params.payer,
      });
      const accountInfo = await connection.getAccountInfo(ata);
      if (!accountInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            params.payer,
            ata,
            params.payer,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      tx.add(
        SystemProgram.transfer({
          fromPubkey: params.payer,
          toPubkey: ata,
          lamports: params.amount,
        }),
        createSyncNativeInstruction(ata, TOKEN_PROGRAM_ID)
      );

      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async unwrap(params: {
    payer: PublicKey;
    wrappedMint: string;
    targetMint: string;
    amount: number;
  }): Promise<Result<Transaction, Error>> {
    try {
      if (params.wrappedMint !== NATIVE_MINT.toBase58()) {
        return failure(new Error('Native wrapper only supports unwrapping from wSOL'));
      }

      if (!isProduction()) {
        logger.warn('NativeWrapperAdapter.unwrap using development fallback transaction');
        return success(new Transaction());
      }

      const blockhashResult = await getSolanaClient().getRecentBlockhash();
      if (!blockhashResult.ok || !blockhashResult.value) {
        return failure(new Error('Failed to fetch recent blockhash'));
      }

      const ata = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        params.payer,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction({
        recentBlockhash: blockhashResult.value,
        feePayer: params.payer,
      });
      tx.add(createCloseAccountInstruction(ata, params.payer, params.payer, [], TOKEN_PROGRAM_ID));

      return success(tx);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async getExchangeRate(_sourceMint: string, _targetMint: string): Promise<Result<number, Error>> {
    try {
      return success(1);
    } catch (err) {
      return failure(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
