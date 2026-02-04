const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

async function analyzeLiquidationRisk(protocols) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `You are a DeFi liquidation analyst specializing in Solana protocols. Analyze liquidation risk:
Protocols: ${JSON.stringify(protocols.map(p => ({name: p.name, tvl: p.tvl, avgHealthFactor: p.avgHealthFactor, recentLiquidations: p.recentLiquidations24h})))}

Which protocol is most likely to see mass liquidations next? Consider: collateral types, health factor distributions, oracle dependencies, and market volatility. Rank protocols by liquidation risk. Style like a risk report (3-4 sentences).`
    }]
  });
  return msg.content[0].text;
}

async function predictRound(roundData) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Predict the outcome of this Liquidation Roulette round:
Round: ${roundData.id}, Duration: ${roundData.duration}
Protocols in play: ${roundData.protocols.join(", ")}
Current bets: ${JSON.stringify(roundData.bets || [])}

Which protocol will have the most liquidations? Analyze current market conditions, recent volatility, and Solana-specific DeFi risks (Kamino, MarginFi, Drift, Solend). Give your pick with confidence %.`
    }]
  });
  return msg.content[0].text;
}

async function postMortem(roundResult) {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Write a post-mortem analysis for a completed Liquidation Roulette round:
Winner: ${roundResult.winningProtocol}
Liquidations: ${JSON.stringify(roundResult.liquidations)}
Total pot: $${roundResult.totalPot}

What caused the liquidation cascade? Were there warning signs? What can traders learn? Brief analysis style (3-4 sentences).`
    }]
  });
  return msg.content[0].text;
}

module.exports = { analyzeLiquidationRisk, predictRound, postMortem };
