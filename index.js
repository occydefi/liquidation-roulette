require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const ai = require("./ai");

const app = express();
const PORT = 3024;

app.use(cors());
app.use(express.json());

// Storage
const protocols = new Map();
const bets = new Map();
const rounds = new Map();

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    skill: "Liquidation-Roulette",
    version: "1.0.0",
    chain: "Solana",
    description: "Bet on which DeFi protocol will have the most liquidations",
    stats: {
      trackedProtocols: protocols.size,
      activeRounds: rounds.size,
      totalBets: bets.size
    }
  });
});

// Get tracked protocols
app.get("/api/protocols", (req, res) => {
  const protocolList = [
    {
      id: "marinade",
      name: "Marinade Finance",
      tvl: 850000000,
      atRiskPositions: 234,
      atRiskValue: 12500000,
      avgHealthFactor: 1.45,
      liquidations24h: 12,
      liquidationVolume24h: 450000,
      riskLevel: "medium"
    },
    {
      id: "solend",
      name: "Solend",
      tvl: 420000000,
      atRiskPositions: 567,
      atRiskValue: 28000000,
      avgHealthFactor: 1.25,
      liquidations24h: 34,
      liquidationVolume24h: 1200000,
      riskLevel: "high"
    },
    {
      id: "mango",
      name: "Mango Markets",
      tvl: 180000000,
      atRiskPositions: 123,
      atRiskValue: 8500000,
      avgHealthFactor: 1.55,
      liquidations24h: 8,
      liquidationVolume24h: 280000,
      riskLevel: "low"
    },
    {
      id: "drift",
      name: "Drift Protocol",
      tvl: 320000000,
      atRiskPositions: 345,
      atRiskValue: 18000000,
      avgHealthFactor: 1.32,
      liquidations24h: 23,
      liquidationVolume24h: 890000,
      riskLevel: "medium-high"
    },
    {
      id: "kamino",
      name: "Kamino Finance",
      tvl: 560000000,
      atRiskPositions: 189,
      atRiskValue: 9200000,
      avgHealthFactor: 1.48,
      liquidations24h: 15,
      liquidationVolume24h: 520000,
      riskLevel: "medium"
    }
  ];
  
  protocolList.forEach(p => protocols.set(p.id, p));
  res.json({ protocols: protocolList, count: protocolList.length });
});

// Create betting round
app.post("/api/rounds/create", (req, res) => {
  const { duration, minBet } = req.body;
  
  const roundId = crypto.randomBytes(6).toString("hex");
  const durationMs = (duration || 3600) * 1000; // Default 1 hour
  
  const round = {
    id: roundId,
    status: "open",
    pools: {},
    bets: [],
    minBet: minBet || 5,
    totalPool: 0,
    createdAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + durationMs).toISOString(),
    result: null
  };
  
  // Initialize pools for each protocol
  protocols.forEach((_, id) => {
    round.pools[id] = 0;
  });
  
  rounds.set(roundId, round);
  
  res.json({
    success: true,
    round,
    message: "Liquidation Roulette round started! Place your bets!"
  });
});

// Place bet on protocol
app.post("/api/rounds/:roundId/bet", (req, res) => {
  const { roundId } = req.params;
  const { agentId, protocolId, amount } = req.body;
  
  const round = rounds.get(roundId);
  if (!round) return res.status(404).json({ error: "Round not found" });
  if (round.status !== "open") return res.status(400).json({ error: "Round not open for betting" });
  
  if (!agentId || !protocolId || !amount) {
    return res.status(400).json({ error: "agentId, protocolId, and amount required" });
  }
  
  if (amount < round.minBet) {
    return res.status(400).json({ error: `Minimum bet is ${round.minBet} USDC` });
  }
  
  const protocol = protocols.get(protocolId);
  if (!protocol) return res.status(404).json({ error: "Protocol not found" });
  
  const bet = {
    id: crypto.randomBytes(4).toString("hex"),
    agentId,
    protocolId,
    protocolName: protocol.name,
    amount,
    timestamp: new Date().toISOString()
  };
  
  round.bets.push(bet);
  round.pools[protocolId] += amount;
  round.totalPool += amount;
  
  rounds.set(roundId, round);
  bets.set(bet.id, bet);
  
  // Calculate current odds
  const odds = {};
  Object.entries(round.pools).forEach(([id, pool]) => {
    odds[id] = pool > 0 ? (round.totalPool / pool).toFixed(2) : "N/A";
  });
  
  res.json({
    success: true,
    bet,
    totalPool: round.totalPool,
    currentOdds: odds,
    message: `Bet placed on ${protocol.name}!`
  });
});

// Get round status
app.get("/api/rounds/:roundId", (req, res) => {
  const round = rounds.get(req.params.roundId);
  if (!round) return res.status(404).json({ error: "Round not found" });
  
  const odds = {};
  Object.entries(round.pools).forEach(([id, pool]) => {
    const protocol = protocols.get(id);
    odds[id] = {
      name: protocol?.name || id,
      pool,
      odds: pool > 0 ? (round.totalPool / pool).toFixed(2) : "N/A",
      probability: round.totalPool > 0 ? (pool / round.totalPool * 100).toFixed(1) + "%" : "0%"
    };
  });
  
  res.json({
    ...round,
    oddsBreakdown: odds,
    timeRemaining: Math.max(0, new Date(round.endsAt) - new Date())
  });
});

// Get active rounds
app.get("/api/rounds", (req, res) => {
  const activeRounds = Array.from(rounds.values())
    .filter(r => r.status === "open")
    .map(r => ({
      id: r.id,
      totalPool: r.totalPool,
      betCount: r.bets.length,
      endsAt: r.endsAt,
      timeRemaining: Math.max(0, new Date(r.endsAt) - new Date())
    }));
  
  res.json({ rounds: activeRounds, count: activeRounds.length });
});

// Resolve round (check actual liquidations)
app.post("/api/rounds/:roundId/resolve", (req, res) => {
  const { roundId } = req.params;
  const { liquidationData } = req.body;
  
  const round = rounds.get(roundId);
  if (!round) return res.status(404).json({ error: "Round not found" });
  
  // Find protocol with most liquidations
  let winner = null;
  let maxLiquidations = 0;
  
  const results = liquidationData || {
    marinade: 15,
    solend: 45,
    mango: 8,
    drift: 28,
    kamino: 12
  };
  
  Object.entries(results).forEach(([id, count]) => {
    if (count > maxLiquidations) {
      maxLiquidations = count;
      winner = id;
    }
  });
  
  round.status = "resolved";
  round.result = {
    winner,
    winnerName: protocols.get(winner)?.name || winner,
    liquidationCounts: results,
    resolvedAt: new Date().toISOString()
  };
  
  // Calculate payouts
  const winningPool = round.pools[winner];
  const winners = round.bets
    .filter(b => b.protocolId === winner)
    .map(b => ({
      agentId: b.agentId,
      bet: b.amount,
      payout: winningPool > 0 ? (b.amount / winningPool * round.totalPool * 0.95).toFixed(2) : 0 // 5% house
    }));
  
  rounds.set(roundId, round);
  
  res.json({
    success: true,
    round,
    winners,
    message: `${round.result.winnerName} had the most liquidations (${maxLiquidations})!`
  });
});

// AI-powered endpoints
app.get("/api/ai/risk-analysis", async (req, res) => {
  try {
    const allProtocols = Array.from(protocols.values());
    const analysis = await ai.analyzeLiquidationRisk(allProtocols);
    res.json({ success: true, analysis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/ai/predict-round/:roundId", async (req, res) => {
  try {
    const round = rounds.get(req.params.roundId);
    if (!round) return res.status(404).json({ error: "Round not found" });
    const prediction = await ai.predictRound(round);
    res.json({ success: true, roundId: req.params.roundId, prediction });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/ai/post-mortem", async (req, res) => {
  try {
    const roundResult = req.body;
    const analysis = await ai.postMortem(roundResult);
    res.json({ success: true, analysis });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Seed demo round
function seedDemo() {
  const demo = {
    id: "demo-round",
    status: "open",
    pools: { marinade: 200, solend: 450, mango: 100, drift: 300, kamino: 150 },
    bets: [
      { id: "b1", agentId: "liquidation-hunter", protocolId: "solend", amount: 250 },
      { id: "b2", agentId: "risk-analyzer", protocolId: "drift", amount: 200 },
      { id: "b3", agentId: "defi-watcher", protocolId: "solend", amount: 200 }
    ],
    minBet: 5,
    totalPool: 1200,
    createdAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString()
  };
  
  rounds.set(demo.id, demo);
}

seedDemo();

app.listen(PORT, () => {
  console.log(`🎰 Liquidation Roulette running on port ${PORT}`);
});
