const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  AiConversation, AiMessage, AiInsight, AiApiKey, AiUsageLog, sequelize
} = require('../models');
const aiService = require('../services/aiService');
const encryptionService = require('../services/encryptionService');
const { QueryTypes } = require('sequelize');

// All routes require authentication
router.use(protect);

// ============================================
// Conversations
// ============================================

// POST /conversations
router.post('/conversations', [
  body('model').optional().isIn(['claude-sonnet-4-6', 'claude-haiku-4-5']),
  body('system_prompt').optional().isString(),
  body('title').optional().isString().isLength({ max: 255 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  const conversation = await AiConversation.create({
    team_id: req.user.team_id,
    user_id: req.user.id,
    model: req.body.model || 'claude-sonnet-4-6',
    system_prompt: req.body.system_prompt || null,
    title: req.body.title || null
  });

  res.status(201).json({ success: true, data: conversation });
});

// GET /conversations
router.get('/conversations', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('archived').optional().isBoolean()
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const isArchived = req.query.archived === 'true';

  const { rows, count } = await AiConversation.findAndCountAll({
    where: {
      team_id: req.user.team_id,
      user_id: req.user.id,
      is_archived: isArchived
    },
    order: [['updated_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// GET /conversations/:id
router.get('/conversations/:id', [
  param('id').isUUID()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id },
    include: [{ model: AiMessage, as: 'messages', order: [['created_at', 'ASC']] }]
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  res.json({ success: true, data: conversation });
});

// PATCH /conversations/:id
router.patch('/conversations/:id', [
  param('id').isUUID(),
  body('title').optional().isString().isLength({ max: 255 }),
  body('is_archived').optional().isBoolean()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  const updates = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.is_archived !== undefined) updates.is_archived = req.body.is_archived;

  await conversation.update(updates);
  res.json({ success: true, data: conversation });
});

// DELETE /conversations/:id
router.delete('/conversations/:id', [
  param('id').isUUID()
], async (req, res) => {
  const conversation = await AiConversation.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }

  await conversation.destroy();
  res.json({ success: true, data: { message: 'Conversation deleted' } });
});

// POST /conversations/:id/messages — SSE streaming
router.post('/conversations/:id/messages', [
  param('id').isUUID(),
  body('content').isString().isLength({ min: 1, max: 10000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  try {
    await aiService.sendMessage({
      conversationId: req.params.id,
      content: req.body.content,
      teamId: req.user.team_id,
      userId: req.user.id,
      res
    });
  } catch (error) {
    console.error('[AI] Message error:', error.message);
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// ============================================
// Insights
// ============================================

// POST /insights/generate
router.post('/insights/generate', [
  body('category').isIn([
    'player_performance', 'pitching_analysis', 'recruiting',
    'lineup', 'scouting', 'game_recap', 'weekly_digest'
  ]),
  body('prompt').optional().isString(),
  body('player_id').optional().isInt(),
  body('game_id').optional().isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }

  const prompt = req.body.prompt || getInsightPrompt(req.body.category, req.body);

  try {
    const result = await aiService.generateInsight({
      teamId: req.user.team_id,
      userId: req.user.id,
      category: req.body.category,
      prompt
    });

    const title = result.content.split('\n')[0].replace(/^#+\s*/, '').substring(0, 255);

    const insight = await AiInsight.create({
      team_id: req.user.team_id,
      user_id: req.user.id,
      category: req.body.category,
      title,
      content: result.content,
      data_snapshot: result.dataSnapshot,
      prompt_used: prompt
    });

    res.status(201).json({ success: true, data: insight, tokens: result.tokens });
  } catch (error) {
    console.error('[AI] Insight generation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /insights
router.get('/insights', [
  query('category').optional().isString(),
  query('pinned').optional().isBoolean(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const where = { team_id: req.user.team_id };

  if (req.query.category) where.category = req.query.category;
  if (req.query.pinned === 'true') where.is_pinned = true;

  const { rows, count } = await AiInsight.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// GET /insights/:id
router.get('/insights/:id', [
  param('id').isUUID()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  res.json({ success: true, data: insight });
});

// PATCH /insights/:id
router.patch('/insights/:id', [
  param('id').isUUID(),
  body('is_pinned').optional().isBoolean()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  if (req.body.is_pinned !== undefined) {
    await insight.update({ is_pinned: req.body.is_pinned });
  }

  res.json({ success: true, data: insight });
});

// DELETE /insights/:id
router.delete('/insights/:id', [
  param('id').isUUID()
], async (req, res) => {
  const insight = await AiInsight.findOne({
    where: { id: req.params.id, team_id: req.user.team_id }
  });

  if (!insight) {
    return res.status(404).json({ success: false, error: 'Insight not found' });
  }

  await insight.destroy();
  res.json({ success: true, data: { message: 'Insight deleted' } });
});

// ============================================
// Pre-Built Prompts
// ============================================

router.get('/prompts', (_req, res) => {
  res.json({ success: true, data: PROMPT_TEMPLATES });
});

// ============================================
// API Keys (BYOK)
// ============================================

// POST /api-keys
router.post('/api-keys', [
  body('api_key').isString().isLength({ min: 10 }),
  body('provider').optional().isIn(['anthropic'])
], async (req, res) => {
  if (!encryptionService.isConfigured()) {
    return res.status(500).json({ success: false, error: 'Encryption not configured on server' });
  }

  const encrypted = encryptionService.encrypt(req.body.api_key);

  const [apiKey, created] = await AiApiKey.findOrCreate({
    where: { team_id: req.user.team_id, provider: req.body.provider || 'anthropic' },
    defaults: { api_key_enc: encrypted, is_active: true }
  });

  if (!created) {
    await apiKey.update({ api_key_enc: encrypted, is_active: true });
  }

  res.status(created ? 201 : 200).json({
    success: true,
    data: { has_key: true, provider: apiKey.provider, created_at: apiKey.created_at }
  });
});

// GET /api-keys
router.get('/api-keys', async (req, res) => {
  const apiKey = await AiApiKey.findOne({
    where: { team_id: req.user.team_id, provider: 'anthropic' },
    attributes: ['provider', 'is_active', 'created_at', 'updated_at']
  });

  res.json({
    success: true,
    data: apiKey
      ? { has_key: true, provider: apiKey.provider, is_active: apiKey.is_active, created_at: apiKey.created_at }
      : { has_key: false }
  });
});

// DELETE /api-keys
router.delete('/api-keys', async (req, res) => {
  await AiApiKey.destroy({
    where: { team_id: req.user.team_id, provider: 'anthropic' }
  });

  res.json({ success: true, data: { message: 'API key removed' } });
});

// POST /api-keys/test
router.post('/api-keys/test', [
  body('api_key').isString().isLength({ min: 10 })
], async (req, res) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: req.body.api_key });
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });
    res.json({ success: true, data: { valid: true } });
  } catch (error) {
    res.json({ success: true, data: { valid: false, error: error.message } });
  }
});

// ============================================
// Usage
// ============================================

// GET /usage
router.get('/usage', async (req, res) => {
  const [summary] = await sequelize.query(`
    SELECT
      COUNT(*) AS total_requests,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN total_tokens ELSE 0 END), 0) AS month_tokens,
      COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN cost_usd ELSE 0 END), 0) AS month_cost_usd
    FROM ai_usage_logs WHERE team_id = :team_id
  `, { replacements: { team_id: req.user.team_id }, type: QueryTypes.SELECT });

  res.json({ success: true, data: summary });
});

// GET /usage/detail
router.get('/usage/detail', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const { rows, count } = await AiUsageLog.findAndCountAll({
    where: { team_id: req.user.team_id },
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  res.json({
    success: true,
    data: rows,
    pagination: { page, limit, total: count, pages: Math.ceil(count / limit) }
  });
});

// ============================================
// Prompt Templates (static data)
// ============================================

const PROMPT_TEMPLATES = {
  player_performance: [
    {
      id: 'player_report',
      label: 'Player Report',
      description: 'Complete performance report for a specific player',
      prompt: 'Give me a complete performance report on {player}. Include current season stats, trends over the last 10 games, splits vs LHP/RHP, and how they compare to team averages. Flag any areas of concern or improvement.',
      variables: ['player']
    },
    {
      id: 'hot_cold_report',
      label: 'Hot/Cold Report',
      description: 'Who is hot and who is cold on the roster',
      prompt: 'Who are the hottest and coldest hitters on the roster over the last 7 games? Show their recent stats vs season averages and note any trends.',
      variables: []
    },
    {
      id: 'pitching_staff_check',
      label: 'Pitching Staff Check',
      description: 'Overview of the pitching staff health and performance',
      prompt: "Give me a pitching staff overview: each pitcher's current season line, workload (innings pitched, pitch counts if available), and any concerning trends in walks or hard contact.",
      variables: []
    }
  ],
  game_prep: [
    {
      id: 'scouting_opponent',
      label: 'Scout Opponent',
      description: 'Scouting report on an upcoming opponent',
      prompt: 'Pull together everything we know about {opponent}. Past game results, their tendencies, and how our hitters/pitchers performed against them.',
      variables: ['opponent']
    },
    {
      id: 'lineup_builder',
      label: 'Lineup Builder',
      description: 'Optimal lineup suggestion based on stats and matchups',
      prompt: "Based on current stats and splits, suggest an optimal lineup for today's game. Consider hot streaks, platoon advantages, and defensive positioning.",
      variables: []
    },
    {
      id: 'bullpen_plan',
      label: 'Bullpen Plan',
      description: 'Reliever availability and readiness ranking',
      prompt: 'Based on recent workload and performance, which relievers are available today and who should be avoided? Rank by readiness.',
      variables: []
    }
  ],
  recruiting: [
    {
      id: 'recruiting_board',
      label: 'Recruiting Board',
      description: 'Overview of recruiting targets and pipeline',
      prompt: 'Show me the current recruiting board. Summarize the top prospects by position, their grades, and where each stands in the pipeline.',
      variables: []
    },
    {
      id: 'player_development',
      label: 'Player Development',
      description: 'Players with the most development upside',
      prompt: 'Identify 3 players who have the most room for improvement based on the gap between their scouting grades (future potential) and current production. Suggest development focus areas.',
      variables: []
    },
    {
      id: 'roster_gaps',
      label: 'Roster Gaps',
      description: 'Identify thin positions and recruiting needs',
      prompt: 'Analyze our depth chart and recruiting board. Where are we thin? Which graduating seniors create holes, and do we have recruits lined up to fill them?',
      variables: []
    }
  ],
  season_analysis: [
    {
      id: 'season_summary',
      label: 'Season Summary',
      description: 'Mid-season team performance report',
      prompt: 'Give me a mid-season report: team record, key stats vs conference averages, biggest wins/losses, and standout individual performances.',
      variables: []
    },
    {
      id: 'conference_standings',
      label: 'Conference Standings',
      description: 'How our stats compare in the conference',
      prompt: 'How do our team stats stack up? Show where we rank in key offensive and pitching categories.',
      variables: []
    },
    {
      id: 'weekly_recap',
      label: 'Weekly Recap',
      description: "Recap of the past week's games and highlights",
      prompt: "Recap this past week's games: results, standout performers, concerning trends, and what to focus on in practice.",
      variables: []
    }
  ]
};

function getInsightPrompt(category, params) {
  const prompts = {
    game_recap: 'Generate a game recap for the most recent completed game. Include key performances, turning points, and box score highlights.',
    player_performance: params.player_id
      ? `Generate a detailed performance analysis for player ID ${params.player_id}. Include trends, splits, and development notes.`
      : 'Generate performance highlights for the top performers on the roster this season.',
    pitching_analysis: "Generate a pitching staff analysis: each pitcher's season line, workload tracking, bullpen health, and efficiency metrics.",
    lineup: "Generate an optimal lineup recommendation for the next game based on current stats, splits, and recent performance.",
    recruiting: 'Generate a recruiting pipeline status report: top prospects by position, pipeline stage, and priority actions needed.',
    scouting: 'Generate a scouting summary of recent evaluation reports and notable grades across the roster.',
    weekly_digest: 'Generate a weekly digest: games played, record, standout performances, areas of concern, and practice recommendations.'
  };
  return prompts[category] || prompts.player_performance;
}

module.exports = router;
