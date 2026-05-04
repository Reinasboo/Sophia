import { execFile } from 'child_process';
import { promisify } from 'util';
import { getConfig } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import type { DataTracker } from './tracker.js';

const execFileAsync = promisify(execFile as any);
const logger = createLogger('GMGN_ADAPTER');

export class GmgnAdapter {
  private pollingIntervalMs: number;
  private binPath: string | undefined;
  private tenantId: string;
  private timer: NodeJS.Timeout | null = null;
  private createIntents: boolean;
  private intentAgentId: string;

  constructor() {
    const cfg = getConfig();
    this.pollingIntervalMs = cfg.GMGN_POLL_INTERVAL_MS;
    this.binPath = cfg.GMGN_CLI_PATH ?? 'gmgn';
    this.tenantId = cfg.GMGN_DEFAULT_TENANT;
    this.createIntents = cfg.GMGN_CREATE_INTENTS === 'true';
    this.intentAgentId = cfg.GMGN_INTENT_AGENT_ID;
  }

  /**
   * Map a GMGN signal object to swap intent params.
   * Heuristics extract token/symbol, side (buy/sell), size (absolute or percent), and slippage.
   */
  static mapSignalToSwapParams(signal: Record<string, unknown>): Record<string, unknown> {
    const s = signal || {};
    // token/symbol/mint
    const token = (s['symbol'] as string) || (s['token'] as string) || (s['mint'] as string) || undefined;

    // side: try common fields
    let side: 'buy' | 'sell' | undefined;
    const rawSide = ((s['side'] as string) || (s['action'] as string) || (s['type'] as string) || '')
      .toLowerCase();
    if (rawSide.includes('buy') || rawSide.includes('long')) side = 'buy';
    else if (rawSide.includes('sell') || rawSide.includes('short')) side = 'sell';

    // size: prefer absolute `amount`, else `size`, else percent fields
    let size: number | undefined;
    if (typeof s['amount'] === 'number') size = s['amount'] as number;
    else if (typeof s['size'] === 'number') size = s['size'] as number;
    else if (typeof s['percent'] === 'number') size = (s['percent'] as number) / 100;

    // slippage
    let slippage = 0.005; // default 0.5%
    if (typeof s['slippage'] === 'number') slippage = s['slippage'] as number;

    const params: Record<string, unknown> = { slippage };
    if (token) params['token'] = token;
    if (side) params['side'] = side;
    if (size !== undefined) params['size'] = size;

    // carry raw signal for audit/debug
    params['raw'] = signal;

    return params;
  }

  private async runCommand(args: string[]): Promise<any> {
    try {
      const { stdout } = await execFileAsync(this.binPath!, args, { maxBuffer: 10 * 1024 * 1024 });
      if (!stdout) return null;
      try {
        return JSON.parse(String(stdout));
      } catch (err) {
        // If output is not JSON, return raw
        return String(stdout);
      }
    } catch (err) {
      logger.error('gmgn command failed', { args, error: String(err) });
      return null;
    }
  }

  /**
   * Poll a set of gmgn data endpoints once and push events into the tracker
   */
  public async pollOnce(tracker: DataTracker): Promise<void> {
    try {
      // market data
      const market = await this.runCommand(['market', '--raw']);
      if (market) {
        await tracker.recordEvent({
          tenantId: this.tenantId,
          eventType: 'system_alert',
          entityId: `gmgn.market.${Date.now()}`,
          entityType: 'system',
          data: { source: 'gmgn', kind: 'market_snapshot', payload: market },
          createdAt: new Date(),
        });
      }

      // portfolio snapshots
      const portfolio = await this.runCommand(['portfolio', '--raw']);
      if (portfolio) {
        await tracker.recordEvent({
          tenantId: this.tenantId,
          eventType: 'system_alert',
          entityId: `gmgn.portfolio.${Date.now()}`,
          entityType: 'system',
          data: { source: 'gmgn', kind: 'portfolio_snapshot', payload: portfolio },
          createdAt: new Date(),
        });
      }

      // token registry data
      const tokens = await this.runCommand(['token', 'list', '--raw']);
      if (tokens) {
        await tracker.recordEvent({
          tenantId: this.tenantId,
          eventType: 'system_alert',
          entityId: `gmgn.tokens.${Date.now()}`,
          entityType: 'system',
          data: { source: 'gmgn', kind: 'token_registry', payload: tokens },
          createdAt: new Date(),
        });
      }

      // activity/track stream
      const track = await this.runCommand(['track', '--raw']);
      if (track) {
        await tracker.recordEvent({
          tenantId: this.tenantId,
          eventType: 'system_alert',
          entityId: `gmgn.track.${Date.now()}`,
          entityType: 'system',
          data: { source: 'gmgn', kind: 'activity_stream', payload: track },
          createdAt: new Date(),
        });

        // Heuristic: if track payload contains trade signals, create pending swap intents
        if (this.createIntents && typeof track === 'object' && track !== null) {
          const signals = track.signals ?? track.trades ?? track.activity ?? null;
          if (Array.isArray(signals)) {
            for (const sig of signals) {
              try {
                const params = GmgnAdapter.mapSignalToSwapParams(sig as Record<string, unknown>);
                await tracker.recordIntent({
                  tenantId: this.tenantId,
                  agentId: this.intentAgentId,
                  intentType: 'swap',
                  status: 'pending',
                  params,
                  createdAt: new Date(),
                });
              } catch (err) {
                logger.error('Failed to record GMGN intent', { error: String(err) });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error('pollOnce failed', { error: String(err) });
    }
  }

  public start(tracker: DataTracker): void {
    if (this.timer) return;
    // Initial immediate poll
    void this.pollOnce(tracker);
    this.timer = setInterval(() => void this.pollOnce(tracker), this.pollingIntervalMs);
    logger.info('GMGN adapter started', { intervalMs: this.pollingIntervalMs, bin: this.binPath });
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('GMGN adapter stopped');
    }
  }
}

export default GmgnAdapter;
