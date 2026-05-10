/**
 * Seed Default Agents for All 11 Strategies
 *
 * Run this script to create a demo agent for each of the 11 built-in strategies.
 * This is useful for:
 * - Testing the agent factory with all strategies
 * - Providing demo agents in the frontend UI
 * - Verifying the complete orchestrator loop
 *
 * Usage:
 *   npm run ts-node scripts/seed-strategies.ts
 */

import { createAgent } from '../src/agent/index.js';
import { getStrategyRegistry } from '../src/agent/index.js';
import { createLogger } from '../src/utils/logger.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const logger = createLogger('SEED_STRATEGIES');

interface SeededAgent {
  id: string;
  name: string;
  strategy: string;
  walletPublicKey: string;
}

async function seedStrategies(): Promise<void> {
  const registry = getStrategyRegistry();
  const allStrategies = registry.list();
  const seededAgents: SeededAgent[] = [];

  logger.info(`🌱 Seeding agents for ${allStrategies.length} strategies...`);

  // Mock wallet for seeding (these agents won't execute, just testing creation)
  const mockWalletId = 'seed-wallet-demo';
  const mockPublicKey = '11111111111111111111111111111111'; // System program public key

  for (const strategyName of allStrategies) {
    const strategyDef = registry.get(strategyName);
    if (!strategyDef) {
      logger.warn(`Strategy not found in registry: ${strategyName}`);
      continue;
    }

    try {
      const agentName = `demo-${strategyName}`;

      const result = createAgent({
        config: {
          name: agentName,
          strategy: strategyName,
          strategyParams: strategyDef.defaultParams,
        },
        walletId: mockWalletId,
        walletPublicKey: mockPublicKey,
      });

      if (result.ok) {
        const agent = result.value;
        seededAgents.push({
          id: agent.id,
          name: agent.name,
          strategy: agent.strategy,
          walletPublicKey: mockPublicKey,
        });

        logger.info(`✓ Created agent`, {
          name: agent.name,
          strategy: agent.strategy,
          agentId: agent.id,
        });
      } else {
        logger.error(`✗ Failed to create agent for ${strategyName}:`, {
          error: result.error.message,
        });
      }
    } catch (error) {
      logger.error(`✗ Exception while seeding ${strategyName}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Save seeded agents metadata to file for reference
  const seedDataPath = join(process.cwd(), 'data', 'seeded-agents.json');
  try {
    writeFileSync(seedDataPath, JSON.stringify(seededAgents, null, 2));
    logger.info(`✓ Saved seeded agents metadata to data/seeded-agents.json`, {
      count: seededAgents.length,
    });
  } catch (error) {
    logger.warn(`Could not save seeded agents file:`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info(`🎉 Seeding complete!`, {
    total: allStrategies.length,
    succeeded: seededAgents.length,
    failed: allStrategies.length - seededAgents.length,
  });

  // Print summary
  console.log('\n📊 SEEDED AGENTS SUMMARY:');
  console.log('========================\n');
  seededAgents.forEach((agent) => {
    console.log(`  ${agent.strategy.padEnd(25)} → ${agent.id}`);
  });
  console.log('\n' + '='.repeat(50) + '\n');
}

seedStrategies().catch((error) => {
  logger.error('Fatal error during seeding:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
