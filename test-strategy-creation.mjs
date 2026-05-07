import { createAgent } from './dist/src/agent/index.js';

// Try to create a scalping_trading agent directly
const result = createAgent({
  config: {
    name: 'test-scalping',
    strategy: 'scalping_trading',
    strategyParams: {
      baseToken: 'USDC',
      targetToken: 'SOL',
      entrySpreadBps: 25,
      exitSpreadBps: 20,
      orderSize: 100,
      maxSlippage: 0.2,
      maxTradesPerHour: 20,
    },
  },
  walletId: 'wallet-test',
  walletPublicKey: '11111111111111111111111111111111',
});

if (result.ok) {
  console.log('✓ Agent created successfully:', {
    id: result.value.id,
    name: result.value.name,
    strategy: result.value.strategy,
  });
  process.exit(0);
} else {
  console.error('✗ Failed to create agent:', result.error.message);
  process.exit(1);
}
