#!/usr/bin/env node
/**
 * MCP Server for Orderbook Imbalance.
 * Connects to DEX WebSockets, exposes tools: get_signals, get_leaderboard, get_arbitrage.
 * Run: npx tsx mcp-server/index.ts [--signal-type noise-reduction|raw]
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { z } from 'zod';
import { WSAggregator, type SignalType } from './wsAggregator';

const DEFAULT_PAIR = 'BTC/USD';

function parseArgs(): { signalType: SignalType } {
  const args = process.argv.slice(2);
  let signalType: SignalType = 'noise-reduction';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--signal-type' && args[i + 1]) {
      signalType = args[i + 1] === 'raw' ? 'raw' : 'noise-reduction';
      break;
    }
  }
  return { signalType };
}

const { signalType } = parseArgs();
const aggregator = new WSAggregator(DEFAULT_PAIR, 'distanceWeighted', undefined, signalType);
aggregator.connect();

const server = new McpServer({
  name: 'orderbook-signals',
  version: '0.1.0',
});

server.registerTool(
  'get_signals',
  {
    description: 'Get trading signals (noise-reduced or raw) for each DEX',
    inputSchema: {
      symbol: z.string().optional().describe('Pair id, e.g. BTC/USD (default: BTC/USD)'),
    },
  },
  async () => {
    const signals = aggregator.getSignals();
    const text = JSON.stringify(signals, null, 2);
    return { content: [{ type: 'text' as const, text }] };
  },
);

server.registerTool(
  'get_leaderboard',
  {
    description: 'Get DEX leaderboard ranked by imbalance (least balanced first)',
    inputSchema: {
      symbol: z.string().optional().describe('Pair id (default: BTC/USD)'),
    },
  },
  async () => {
    const leaderboard = aggregator.getLeaderboard();
    const text = JSON.stringify(leaderboard, null, 2);
    return { content: [{ type: 'text' as const, text }] };
  },
);

server.registerTool(
  'get_arbitrage',
  {
    description: 'Get cross-DEX arbitrage opportunities (max opportunity first)',
    inputSchema: {
      symbol: z.string().optional().describe('Pair id (default: BTC/USD)'),
    },
  },
  async () => {
    const arb = aggregator.getArbitrage();
    const text = JSON.stringify(arb, null, 2);
    return { content: [{ type: 'text' as const, text }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Orderbook MCP Server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
