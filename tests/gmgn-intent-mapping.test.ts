import { describe, it, expect } from 'vitest';
import GmgnAdapter from '../src/data/gmgn-adapter.js';

describe('GMGN Signal Mapping', () => {
  it('maps symbol/amount/side to swap params', () => {
    const signal = { symbol: 'SOL', amount: 10, side: 'BUY', slippage: 0.01 };
    const params = GmgnAdapter.mapSignalToSwapParams(signal as any);
    expect(params.token).toBe('SOL');
    expect(params.size).toBe(10);
    expect(params.side).toBe('buy');
    expect(params.slippage).toBe(0.01);
    expect(params.raw).toEqual(signal);
  });

  it('maps percent size to fractional size and defaults slippage', () => {
    const signal = { token: 'ABC', percent: 5, action: 'long' };
    const params = GmgnAdapter.mapSignalToSwapParams(signal as any);
    expect(params.token).toBe('ABC');
    expect(params.size).toBeCloseTo(0.05);
    expect(params.side).toBe('buy');
    expect(params.slippage).toBeCloseTo(0.005);
  });

  it('handles mint and sell signals', () => {
    const signal = { mint: 'MintAddr', size: 2, type: 'SELL' };
    const params = GmgnAdapter.mapSignalToSwapParams(signal as any);
    expect(params.token).toBe('MintAddr');
    expect(params.size).toBe(2);
    expect(params.side).toBe('sell');
  });
});
