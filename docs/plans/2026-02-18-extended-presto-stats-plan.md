# Extended PrestoSports Stats & Coach's Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add split stats (HOME/AWAY/CONFERENCE/situational), team aggregate stats, game log with team stats, and a coach's dashboard to the PrestoSports integration.

**Architecture:** JSONB columns on existing tables (player_season_stats, games, teams) store the full Presto stat payloads. New sync methods in prestoSyncService call Presto's `options` filter for splits and two unused team-level endpoints. New API routes serve split data, game logs, team aggregates, and a combined coach's dashboard.

**Tech Stack:** Node.js/Express, PostgreSQL 15 (JSONB), Sequelize ORM, CommonJS

---

## Task 1: Database Migration

**Files:**
- Create: `src/migrations/20260218100000-add-extended-presto-stats.js`
- Modify: `src/models/PlayerSeasonStats.js`
- Modify: `src/models/Game.js`
- Modify: `src/models/Team.js`

**Step 1: Create the migration file**

```javascript
// src/migrations/20260218100000-add-extended-presto-stats.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // PlayerSeasonStats: raw_stats and split_stats JSONB
    await queryInterface.addColumn('player_season_stats', 'raw_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Full 214-key Presto stats object'
    });
    await queryInterface.addColumn('player_season_stats', 'split_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Keyed by split type: home, away, conference, vs_lhp, vs_rhp, risp, two_outs, bases_loaded, bases_empty, leadoff, with_runners'
    });

    // Games: team_stats, opponent_stats, game_summary, running records
    await queryInterface.addColumn('games', 'team_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Per-game team batting/pitching/fielding from Presto'
    });
    await queryInterface.addColumn('games', 'opponent_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Per-game opponent stats'
    });
    await queryInterface.addColumn('games', 'game_summary', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'e.g. "W, 5-3"'
    });
    await queryInterface.addColumn('games', 'running_record', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Team record at time of game, e.g. "15-8"'
    });
    await queryInterface.addColumn('games', 'running_conference_record', {
      type: Sequelize.STRING(20),
      allowNull: true,
      comment: 'Conference record at time of game'
    });

    // Teams: aggregate stats JSONB columns
    await queryInterface.addColumn('teams', 'team_batting_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team batting from Presto getTeamStats()'
    });
    await queryInterface.addColumn('teams', 'team_pitching_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team pitching'
    });
    await queryInterface.addColumn('teams', 'team_fielding_stats', {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: 'Aggregate team fielding'
    });
    await queryInterface.addColumn('teams', 'stats_last_synced_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When team stats were last refreshed'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('player_season_stats', 'raw_stats');
    await queryInterface.removeColumn('player_season_stats', 'split_stats');
    await queryInterface.removeColumn('games', 'team_stats');
    await queryInterface.removeColumn('games', 'opponent_stats');
    await queryInterface.removeColumn('games', 'game_summary');
    await queryInterface.removeColumn('games', 'running_record');
    await queryInterface.removeColumn('games', 'running_conference_record');
    await queryInterface.removeColumn('teams', 'team_batting_stats');
    await queryInterface.removeColumn('teams', 'team_pitching_stats');
    await queryInterface.removeColumn('teams', 'team_fielding_stats');
    await queryInterface.removeColumn('teams', 'stats_last_synced_at');
  }
};
```

**Step 2: Add JSONB columns to PlayerSeasonStats model**

In `src/models/PlayerSeasonStats.js`, add after `last_synced_at` (line ~107):

```javascript
  // Extended Presto stats
  raw_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Full Presto stats object (214 keys)'
  },
  split_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Keyed by split type: home, away, conference, vs_lhp, vs_rhp, risp, two_outs, bases_loaded, bases_empty, leadoff, with_runners'
  }
```

**Step 3: Add JSONB columns to Game model**

In `src/models/Game.js`, add after `game_status` (line ~126):

```javascript
  // Extended Presto game stats
  team_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Per-game team stats from Presto'
  },
  opponent_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Per-game opponent stats'
  },
  game_summary: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'e.g. "W, 5-3"'
  },
  running_record: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Team record at time of game'
  },
  running_conference_record: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Conference record at time of game'
  }
```

**Step 4: Add JSONB columns to Team model**

In `src/models/Team.js`, add after `record_last_synced_at` (line ~144):

```javascript
  // Aggregate team stats from Presto
  team_batting_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Aggregate team batting from Presto'
  },
  team_pitching_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Aggregate team pitching'
  },
  team_fielding_stats: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Aggregate team fielding'
  },
  stats_last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When team stats were last refreshed'
  }
```

**Step 5: Run the migration**

```bash
docker exec sports2_backend npm run db:migrate
```

Expected: Migration runs, adds 11 new columns across 3 tables.

**Step 6: Commit**

```bash
git add src/migrations/20260218100000-add-extended-presto-stats.js src/models/PlayerSeasonStats.js src/models/Game.js src/models/Team.js
git commit -m "feat: add JSONB columns for extended Presto stats, splits, and game log"
```

---

## Task 2: Sync — Save raw_stats on Season Stats

**Files:**
- Modify: `src/services/prestoSyncService.js` (syncSeasonStats method, ~line 969)

**Step 1: Update syncSeasonStats to save raw_stats**

In `prestoSyncService.js`, inside the `syncSeasonStats` method, find the `seasonData` object (line ~969). Add `raw_stats` field:

```javascript
          const seasonData = {
            player_id: player.id,
            team_id: teamId,
            season: prestoSeasonId || 'current',
            season_name: seasonName,
            presto_season_id: prestoSeasonId,

            // Store full Presto stats payload
            raw_stats: s,

            // ... rest of existing fields unchanged
```

The `s` variable is already defined as `playerItem.stats || {}` on line ~959.

**Step 2: Test by triggering a sync**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncSeasonStats(1).then(r => {
  console.log('Result:', JSON.stringify(r));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"
```

Then verify raw_stats was saved:

```bash
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT player_id, raw_stats->'avg' as avg, raw_stats->'ops' as ops FROM player_season_stats WHERE raw_stats IS NOT NULL LIMIT 3;"
```

Expected: Shows avg and ops values from JSONB.

**Step 3: Commit**

```bash
git add src/services/prestoSyncService.js
git commit -m "feat: save raw_stats JSONB in syncSeasonStats"
```

---

## Task 3: Sync — Split Stats (HOME/AWAY/CONFERENCE + Situational)

**Files:**
- Modify: `src/services/prestoSyncService.js`

**Step 1: Add the extractSituationalSplits helper method**

Add this method to the PrestoSyncService class (before `syncAll`):

```javascript
  /**
   * Extract situational split stats from a Presto stats object.
   * These fields are embedded in every response, not requiring separate API calls.
   * @param {object} s - The Presto stats object
   * @returns {object} Keyed by split type
   */
  extractSituationalSplits(s) {
    return {
      vs_lhp: {
        ab: s.hittingvsleftab, h: s.hittingvslefth, pct: s.hittingvsleftpct,
        pitching_ab: s.pitchingvsleftab, pitching_h: s.pitchingvslefth, pitching_pct: s.pitchingvsleftpct
      },
      vs_rhp: {
        ab: s.hittingvsrightab, h: s.hittingvsrighth, pct: s.hittingvsrightpct,
        pitching_ab: s.pitchingvsrightab, pitching_h: s.pitchingvsrighth, pitching_pct: s.pitchingvsrightpct
      },
      risp: {
        record: s.hittingrbi3rd, opportunities: s.hittingrbi3rdno,
        ops: s.hittingrbi3rdops, pct: s.hittingrbi3rdpct
      },
      two_outs: {
        ab: s.hittingw2outsab, h: s.hittingw2outsh, pct: s.hittingw2outspct,
        rbi: s.hittingrbi2out,
        pitching_ab: s.pitchingw2outsab, pitching_h: s.pitchingw2outsh, pitching_pct: s.pitchingw2outspct
      },
      bases_loaded: {
        ab: s.hittingwloadedab, h: s.hittingwloadedh, pct: s.hittingwloadedpct,
        pitching_ab: s.pitchingwloadedab, pitching_h: s.pitchingwloadedh, pitching_pct: s.pitchingwloadedpct
      },
      bases_empty: {
        ab: s.hittingemptyab, h: s.hittingemptyh, pct: s.hittingemptypct,
        pitching_ab: s.pitchingemptyab, pitching_h: s.pitchingemptyh, pitching_pct: s.pitchingemptypct
      },
      with_runners: {
        ab: s.hittingwrunnersab, h: s.hittingwrunnersh, pct: s.hittingwrunnerspct,
        pitching_ab: s.pitchingwrunnersab, pitching_h: s.pitchingwrunnersh, pitching_pct: s.pitchingwrunnerspct
      },
      leadoff: {
        record: s.hittingleadoff, opportunities: s.hittingleadoffno,
        ops: s.hittingleadoffops, pct: s.hittingleadoffpct,
        pitching_record: s.pitchingleadoff, pitching_opportunities: s.pitchingleadoffno,
        pitching_ops: s.pitchingleadoffops, pitching_pct: s.pitchingleadoffpct
      }
    };
  }
```

**Step 2: Add the syncSplitStats method**

Add this method to the PrestoSyncService class:

```javascript
  /**
   * Sync split stats (HOME/AWAY/CONFERENCE) and situational stats for all players.
   * Called as part of syncAll() on the 4-hour cycle.
   */
  async syncSplitStats(teamId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const results = { updated: 0, errors: [] };
    const token = await this.getToken(teamId);

    // Fetch overall stats first (for situational splits embedded in response)
    const overallResponse = await prestoSportsService.getTeamPlayerStats(token, prestoTeamId);
    const overallPlayers = overallResponse.data || [];

    // Build a map: prestoPlayerId -> situational splits from overall response
    const situationalByPrestoId = {};
    for (const p of overallPlayers) {
      const s = p.stats || {};
      situationalByPrestoId[p.playerId] = this.extractSituationalSplits(s);
    }

    // Fetch HOME, AWAY, CONFERENCE splits (requires separate API calls)
    const splitOptions = ['HOME', 'AWAY', 'CONFERENCE'];
    const splitDataByPrestoId = {};

    for (const opt of splitOptions) {
      try {
        const response = await prestoSportsService.getTeamPlayerStats(token, prestoTeamId, { options: opt });
        const players = response.data || [];
        for (const p of players) {
          if (!splitDataByPrestoId[p.playerId]) {
            splitDataByPrestoId[p.playerId] = {};
          }
          splitDataByPrestoId[p.playerId][opt.toLowerCase()] = p.stats || {};
        }
      } catch (error) {
        results.errors.push({ split: opt, error: error.message });
      }
    }

    // Now merge and save to DB
    for (const prestoPlayerId of Object.keys(splitDataByPrestoId)) {
      try {
        const player = await Player.findOne({
          where: { external_id: String(prestoPlayerId), team_id: teamId }
        });
        if (!player) continue;

        const splitStats = {
          ...splitDataByPrestoId[prestoPlayerId],
          ...(situationalByPrestoId[prestoPlayerId] || {})
        };

        await PlayerSeasonStats.update(
          { split_stats: splitStats },
          {
            where: {
              player_id: player.id,
              team_id: teamId,
              source_system: 'presto'
            }
          }
        );
        results.updated++;
      } catch (error) {
        results.errors.push({ player: prestoPlayerId, error: error.message });
      }
    }

    return results;
  }
```

**Step 3: Test the split sync**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncSplitStats(1).then(r => {
  console.log('Result:', JSON.stringify(r));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"
```

Then verify:

```bash
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT player_id, split_stats->'home'->'avg' as home_avg, split_stats->'away'->'avg' as away_avg, split_stats->'vs_lhp'->'pct' as vs_lhp FROM player_season_stats WHERE split_stats IS NOT NULL LIMIT 5;"
```

**Step 4: Commit**

```bash
git add src/services/prestoSyncService.js
git commit -m "feat: add syncSplitStats for HOME/AWAY/CONFERENCE and situational splits"
```

---

## Task 4: Sync — Team Aggregate Stats

**Files:**
- Modify: `src/services/prestoSyncService.js`

**Step 1: Add syncTeamAggregateStats method**

```javascript
  /**
   * Sync team aggregate stats (batting/pitching/fielding) from Presto.
   */
  async syncTeamAggregateStats(teamId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const token = await this.getToken(teamId);
    const response = await prestoSportsService.getTeamStats(token, prestoTeamId);
    const allStats = response.data?.stats || response.data || {};

    // Split the flat stats object into batting/pitching/fielding groups
    const battingKeys = ['ab', 'r', 'h', 'hr', 'rbi', 'bb', 'k', 'sb', 'cs', 'hbp', 'sf', 'sh',
      'avg', 'obp', 'slg', 'ops', 'tb', 'xbh', 'dp', 'gdp', 'pa', 'lob',
      'runspergame', 'homerunspergame', 'stolenbasespergame', 'doublespergame', 'triplespergame',
      'hittingvsleftpct', 'hittingvsrightpct', 'hittingwrunnerspct', 'hittingw2outspct',
      'hittingadvopspct', 'hittingleadoffpct', 'hittingwloadedpct', 'hittingrbi3rdpct',
      'hittingemptypct', 'hittingtotalhabpct', 'score'];
    const pitchingKeys = ['era', 'whip', 'ip', 'ipraw', 'pw', 'pl', 'sv', 'cg', 'sho', 'hd',
      'bf', 'ph', 'pr', 'er', 'phr', 'pbb', 'pk', 'bk', 'wp', 'ibb',
      'pavg', 'kavg', 'bbavg', 'strikeoutspergame', 'walkspergame',
      'pitchingvsleftpct', 'pitchingvsrightpct', 'pitchingw2outspct',
      'pitchingwrunnerspct', 'pitchingwloadedpct', 'pitchingleadoffpct',
      'pitchingemptypct', 'pitchingtotalhabpct', 'pitchingflygnd',
      'eraplus', 'kbbrate', 'pbbrate', 'ipapp'];
    const fieldingKeys = ['e', 'a', 'po', 'tc', 'fpct', 'dp', 'ci', 'pb', 'rcs', 'stlata', 'sba', 'sbpct'];

    const pick = (keys) => {
      const obj = {};
      for (const k of keys) {
        if (allStats[k] !== undefined) obj[k] = allStats[k];
      }
      return obj;
    };

    await Team.update({
      team_batting_stats: pick(battingKeys),
      team_pitching_stats: pick(pitchingKeys),
      team_fielding_stats: pick(fieldingKeys),
      stats_last_synced_at: new Date()
    }, {
      where: { id: teamId }
    });

    return { success: true };
  }
```

Note: You'll need to add `Team` to the destructured imports at the top of the file if not already present.

**Step 2: Test**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncTeamAggregateStats(1).then(r => {
  console.log('Result:', JSON.stringify(r));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"
```

Verify:

```bash
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT team_batting_stats->'avg' as avg, team_batting_stats->'ops' as ops, team_pitching_stats->'era' as era FROM teams WHERE id=1;"
```

**Step 3: Commit**

```bash
git add src/services/prestoSyncService.js
git commit -m "feat: add syncTeamAggregateStats for team batting/pitching/fielding"
```

---

## Task 5: Sync — Game Log (Per-Event Team Stats)

**Files:**
- Modify: `src/services/prestoSyncService.js`

**Step 1: Add syncGameLog method**

```javascript
  /**
   * Sync per-game team stats from Presto's getTeamEventStats endpoint.
   * Matches Presto events to local games by presto_event_id.
   */
  async syncGameLog(teamId) {
    const { prestoTeamId } = await this.getPrestoConfig(teamId);
    if (!prestoTeamId) {
      throw new Error('PrestoSports team ID not configured');
    }

    const token = await this.getToken(teamId);
    const response = await prestoSportsService.getTeamEventStats(token, prestoTeamId);
    const events = response.data || [];

    const results = { updated: 0, skipped: 0, errors: [] };

    for (const event of events) {
      try {
        if (!event.eventId) {
          results.skipped++;
          continue;
        }

        // Find the local game by presto_event_id
        const game = await Game.findOne({
          where: {
            team_id: teamId,
            [Op.or]: [
              { presto_event_id: event.eventId },
              { external_id: event.eventId }
            ]
          }
        });

        if (!game) {
          results.skipped++;
          continue;
        }

        await game.update({
          team_stats: event.stats || null,
          game_summary: event.resultWinnerLoser || event.resultUsOpponent || null,
          running_record: event.currentRecord || null,
          running_conference_record: event.currentRecordConference || null,
          last_synced_at: new Date()
        });

        results.updated++;
      } catch (error) {
        results.errors.push({ event: event.eventId, error: error.message });
      }
    }

    return results;
  }
```

Note: Ensure `Op` is imported at the top of the file (`const { Op } = require('sequelize');` — already present on line 1).

**Step 2: Test**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncGameLog(1).then(r => {
  console.log('Result:', JSON.stringify(r));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"
```

Verify:

```bash
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT opponent, game_summary, running_record, team_stats->'avg' as team_avg FROM games WHERE team_stats IS NOT NULL ORDER BY game_date DESC LIMIT 5;"
```

**Step 3: Commit**

```bash
git add src/services/prestoSyncService.js
git commit -m "feat: add syncGameLog for per-event team stats"
```

---

## Task 6: Wire New Syncs into syncAll()

**Files:**
- Modify: `src/services/prestoSyncService.js` (syncAll method, ~line 1935)

**Step 1: Add the three new sync calls to syncAll**

After the `pressReleases` sync block (line ~1935), add:

```javascript
    try {
      results.splitStats = await this.syncSplitStats(teamId);
    } catch (error) {
      results.errors.push({ type: 'splitStats', error: error.message });
    }

    try {
      results.teamAggregateStats = await this.syncTeamAggregateStats(teamId);
    } catch (error) {
      results.errors.push({ type: 'teamAggregateStats', error: error.message });
    }

    try {
      results.gameLog = await this.syncGameLog(teamId);
    } catch (error) {
      results.errors.push({ type: 'gameLog', error: error.message });
    }
```

Also update the `totalCreated` and `totalUpdated` calculations (~line 1938) to include the new results:

```javascript
    const totalUpdated = (results.roster?.updated || 0) + (results.schedule?.updated || 0) +
      (results.stats?.statsUpdated || 0) + (results.seasonStats?.updated || 0) +
      (results.careerStats?.updated || 0) + (results.teamRecord?.success ? 1 : 0) +
      (results.historicalStats?.updated || 0) + (results.playerVideos?.updated || 0) +
      (results.pressReleases?.updated || 0) +
      (results.splitStats?.updated || 0) + (results.teamAggregateStats?.success ? 1 : 0) +
      (results.gameLog?.updated || 0);
```

**Step 2: Test full sync**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncAll(1, 1).then(r => {
  console.log('Split stats:', JSON.stringify(r.splitStats));
  console.log('Team aggregate:', JSON.stringify(r.teamAggregateStats));
  console.log('Game log:', JSON.stringify(r.gameLog));
  console.log('Errors:', JSON.stringify(r.errors));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: All three new sync methods run without errors.

**Step 3: Commit**

```bash
git add src/services/prestoSyncService.js
git commit -m "feat: wire split stats, team aggregates, and game log into syncAll()"
```

---

## Task 7: API — Player Splits Endpoint

**Files:**
- Modify: `src/routes/players.js`
- Test: `src/routes/__tests__/player-splits.test.js`

**Step 1: Write the test**

```javascript
// src/routes/__tests__/player-splits.test.js
const { sequelize, User, Team, Player, PlayerSeasonStats } = require('../../models');
const app = require('../../server');
const request = require('supertest');

let token, team, player, seasonStats;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({ name: 'Test Team', sport: 'baseball' });
  const user = await User.create({
    email: 'test@test.com',
    password: 'Test1234!',
    first_name: 'Test',
    last_name: 'User',
    role: 'head_coach',
    team_id: team.id
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'test@test.com', password: 'Test1234!' });
  token = loginRes.body.data?.token || loginRes.body.token;

  player = await Player.create({
    first_name: 'Jendy',
    last_name: 'Gonzalez',
    position: 'IF',
    team_id: team.id,
    created_by: user.id
  });

  seasonStats = await PlayerSeasonStats.create({
    player_id: player.id,
    team_id: team.id,
    season: 'current',
    at_bats: 50,
    hits: 15,
    batting_average: 0.300,
    source_system: 'presto',
    raw_stats: { ab: '50', h: '15', avg: '.300', ops: '.788', hr: '1' },
    split_stats: {
      home: { ab: '14', h: '2', avg: '.143', ops: '.476' },
      away: { ab: '26', h: '8', avg: '.308', ops: '.806' },
      conference: { ab: '11', h: '5', avg: '.500' },
      vs_lhp: { ab: '6', h: '1', pct: '.167' },
      vs_rhp: { ab: '19', h: '2', pct: '.105' },
      risp: { record: '2-8', pct: '.250' },
      two_outs: { ab: '10', h: '3', pct: '.300' },
      bases_loaded: { ab: '2', h: '1', pct: '.500' }
    }
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/players/byId/:id/splits', () => {
  it('should return all split stats for a player', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/splits`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.splits).toBeDefined();
    expect(res.body.data.splits.home.avg).toBe('.143');
    expect(res.body.data.splits.away.avg).toBe('.308');
    expect(res.body.data.splits.vs_lhp.pct).toBe('.167');
    expect(res.body.data.splits.overall).toBeDefined();
    expect(res.body.data.splits.overall.avg).toBe('.300');
  });

  it('should return 404 for non-existent player', async () => {
    const res = await request(app)
      .get('/api/v1/players/byId/99999/splits')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should require authentication', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/splits`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/players/byId/:id/stats/raw', () => {
  it('should return full raw stats', async () => {
    const res = await request(app)
      .get(`/api/v1/players/byId/${player.id}/stats/raw`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.raw_stats.avg).toBe('.300');
    expect(res.body.data.raw_stats.hr).toBe('1');
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
docker exec sports2_backend npx jest src/routes/__tests__/player-splits.test.js --no-coverage --verbose 2>&1 | tail -20
```

Expected: FAIL — routes not yet defined.

**Step 3: Add the routes to players.js**

In `src/routes/players.js`, add before the `module.exports` line:

```javascript
/**
 * GET /api/v1/players/byId/:id/splits
 * Returns split stats (home/away/conf/situational) for a player.
 */
router.get('/byId/:id/splits', async (req, res) => {
  try {
    const { Player, PlayerSeasonStats } = require('../models');

    const player = await Player.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found' });
    }

    const seasonStats = await PlayerSeasonStats.findOne({
      where: { player_id: player.id, team_id: req.user.team_id },
      order: [['created_at', 'DESC']]
    });

    if (!seasonStats || !seasonStats.split_stats) {
      return res.json({
        success: true,
        data: {
          player_id: player.id,
          player_name: `${player.first_name} ${player.last_name}`,
          splits: null,
          message: 'No split stats available. Sync with PrestoSports to populate.'
        }
      });
    }

    res.json({
      success: true,
      data: {
        player_id: player.id,
        player_name: `${player.first_name} ${player.last_name}`,
        season: seasonStats.season,
        season_name: seasonStats.season_name,
        splits: {
          overall: seasonStats.raw_stats || {},
          ...seasonStats.split_stats
        }
      }
    });
  } catch (error) {
    console.error('Error fetching player splits:', error);
    res.status(500).json({ success: false, error: 'Error fetching player splits' });
  }
});

/**
 * GET /api/v1/players/byId/:id/stats/raw
 * Returns the full 214-key Presto stats object.
 */
router.get('/byId/:id/stats/raw', async (req, res) => {
  try {
    const { Player, PlayerSeasonStats } = require('../models');

    const player = await Player.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found' });
    }

    const seasonStats = await PlayerSeasonStats.findOne({
      where: { player_id: player.id, team_id: req.user.team_id },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        player_id: player.id,
        player_name: `${player.first_name} ${player.last_name}`,
        season: seasonStats?.season,
        season_name: seasonStats?.season_name,
        raw_stats: seasonStats?.raw_stats || null
      }
    });
  } catch (error) {
    console.error('Error fetching player raw stats:', error);
    res.status(500).json({ success: false, error: 'Error fetching player raw stats' });
  }
});

/**
 * GET /api/v1/players/byId/:id/game-log
 * Returns per-game stats with game context.
 */
router.get('/byId/:id/game-log', async (req, res) => {
  try {
    const { Player, GameStatistic, Game } = require('../models');

    const player = await Player.findOne({
      where: { id: req.params.id, team_id: req.user.team_id }
    });

    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found' });
    }

    const gameStats = await GameStatistic.findAll({
      where: { player_id: player.id, team_id: req.user.team_id },
      include: [{
        model: Game,
        as: 'game',
        attributes: ['id', 'opponent', 'game_date', 'home_away', 'result',
          'team_score', 'opponent_score', 'game_summary', 'running_record']
      }],
      order: [[{ model: Game, as: 'game' }, 'game_date', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        player_id: player.id,
        player_name: `${player.first_name} ${player.last_name}`,
        games: gameStats.map(gs => ({
          game: gs.game ? {
            id: gs.game.id,
            opponent: gs.game.opponent,
            date: gs.game.game_date,
            home_away: gs.game.home_away,
            result: gs.game.result,
            score: gs.game.team_score !== null ? `${gs.game.team_score}-${gs.game.opponent_score}` : null,
            game_summary: gs.game.game_summary,
            running_record: gs.game.running_record
          } : null,
          batting: {
            ab: gs.at_bats, r: gs.runs, h: gs.hits, doubles: gs.doubles, triples: gs.triples,
            hr: gs.home_runs, rbi: gs.rbi, bb: gs.walks, so: gs.strikeouts_batting,
            sb: gs.stolen_bases, hbp: gs.hit_by_pitch
          },
          pitching: gs.innings_pitched > 0 ? {
            ip: gs.innings_pitched, h: gs.hits_allowed, r: gs.runs_allowed, er: gs.earned_runs,
            bb: gs.walks_allowed, so: gs.strikeouts_pitching, hr: gs.home_runs_allowed,
            pitches: gs.pitches_thrown, win: gs.win, loss: gs.loss, save: gs.save
          } : null,
          fielding: {
            po: gs.putouts, a: gs.assists, e: gs.errors
          },
          position: gs.position_played
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching player game log:', error);
    res.status(500).json({ success: false, error: 'Error fetching player game log' });
  }
});
```

**Step 4: Run tests**

```bash
docker exec sports2_backend npx jest src/routes/__tests__/player-splits.test.js --no-coverage --verbose 2>&1 | tail -30
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/routes/players.js src/routes/__tests__/player-splits.test.js
git commit -m "feat: add player splits, raw stats, and game log API endpoints"
```

---

## Task 8: API — Team Dashboard, Game Log, Aggregate Stats, and Lineup

**Files:**
- Modify: `src/routes/teams/stats.js`
- Test: `src/routes/__tests__/team-dashboard.test.js`

**Step 1: Write the test**

```javascript
// src/routes/__tests__/team-dashboard.test.js
const { sequelize, User, Team, Player, Game, GameStatistic, PlayerSeasonStats } = require('../../models');
const app = require('../../server');
const request = require('supertest');

let token, team, player;

beforeAll(async () => {
  await sequelize.sync({ force: true });

  team = await Team.create({
    name: 'Miami Dade',
    sport: 'baseball',
    wins: 15,
    losses: 8,
    conference_wins: 8,
    conference_losses: 4,
    team_batting_stats: { avg: '.272', ops: '.714', r: '83', hr: '7' },
    team_pitching_stats: { era: '3.57', whip: '1.30', pk: '115' },
    team_fielding_stats: { fpct: '.952', e: '24' },
    stats_last_synced_at: new Date()
  });

  const user = await User.create({
    email: 'coach@test.com',
    password: 'Test1234!',
    first_name: 'Coach',
    last_name: 'Test',
    role: 'head_coach',
    team_id: team.id
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'coach@test.com', password: 'Test1234!' });
  token = loginRes.body.data?.token || loginRes.body.token;

  player = await Player.create({
    first_name: 'Jendy',
    last_name: 'Gonzalez',
    position: 'IF',
    status: 'active',
    team_id: team.id,
    created_by: user.id
  });

  await PlayerSeasonStats.create({
    player_id: player.id,
    team_id: team.id,
    season: 'current',
    at_bats: 50,
    hits: 15,
    batting_average: 0.300,
    home_runs: 1,
    rbi: 8,
    source_system: 'presto',
    raw_stats: { avg: '.300', ops: '.788' }
  });

  const game = await Game.create({
    opponent: 'FSW',
    game_date: new Date('2026-02-15'),
    home_away: 'away',
    result: 'W',
    team_score: 5,
    opponent_score: 3,
    team_id: team.id,
    created_by: user.id,
    game_status: 'completed',
    team_stats: { avg: '.280', hr: '2', era: '2.00' },
    game_summary: 'W, 5-3',
    running_record: '15-8',
    running_conference_record: '8-4'
  });

  await GameStatistic.create({
    game_id: game.id,
    player_id: player.id,
    team_id: team.id,
    at_bats: 4,
    hits: 2,
    runs: 1,
    rbi: 1,
    position_played: 'SS'
  });
});

afterAll(async () => {
  await sequelize.close();
});

describe('GET /api/v1/teams/dashboard', () => {
  it('should return full coach dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/teams/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.record.wins).toBe(15);
    expect(res.body.data.team_batting.avg).toBe('.272');
    expect(res.body.data.team_pitching.era).toBe('3.57');
    expect(res.body.data.recent_games).toHaveLength(1);
    expect(res.body.data.recent_games[0].game_summary).toBe('W, 5-3');
  });
});

describe('GET /api/v1/teams/game-log', () => {
  it('should return team game log', async () => {
    const res = await request(app)
      .get('/api/v1/teams/game-log')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.games).toHaveLength(1);
    expect(res.body.data.games[0].team_stats).toBeDefined();
    expect(res.body.data.games[0].running_record).toBe('15-8');
  });
});

describe('GET /api/v1/teams/aggregate-stats', () => {
  it('should return team aggregate stats', async () => {
    const res = await request(app)
      .get('/api/v1/teams/aggregate-stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.batting.avg).toBe('.272');
    expect(res.body.data.pitching.era).toBe('3.57');
  });
});

describe('GET /api/v1/teams/lineup', () => {
  it('should return lineup from most recent game', async () => {
    const res = await request(app)
      .get('/api/v1/teams/lineup')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.players.length).toBeGreaterThan(0);
    expect(res.body.data.players[0].position).toBe('SS');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
docker exec sports2_backend npx jest src/routes/__tests__/team-dashboard.test.js --no-coverage --verbose 2>&1 | tail -20
```

Expected: FAIL — routes not yet defined.

**Step 3: Add the routes to teams/stats.js**

In `src/routes/teams/stats.js`, add these routes after the existing `/roster` route and before `module.exports`:

```javascript
/**
 * GET /api/v1/teams/dashboard
 * Coach's dashboard: record, team stats, recent games, stat leaders.
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { Team, Game, Player, PlayerSeasonStats } = require('../../models');
    const { Op } = require('sequelize');

    const team = await Team.findByPk(req.user.team_id);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    // Recent games (last 10)
    const recentGames = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      attributes: ['id', 'opponent', 'game_date', 'home_away', 'result',
        'team_score', 'opponent_score', 'game_summary', 'running_record',
        'running_conference_record'],
      order: [['game_date', 'DESC']],
      limit: 10
    });

    // Stat leaders (top 3 in key categories)
    const seasonStats = await PlayerSeasonStats.findAll({
      where: { team_id: req.user.team_id, source_system: 'presto' },
      include: [{ model: Player, as: 'player', attributes: ['id', 'first_name', 'last_name'] }],
      order: [['created_at', 'DESC']]
    });

    // Deduplicate to latest season per player
    const latestByPlayer = {};
    for (const ss of seasonStats) {
      if (!latestByPlayer[ss.player_id]) latestByPlayer[ss.player_id] = ss;
    }
    const allStats = Object.values(latestByPlayer);

    const leaderFor = (field, limit = 3, filter = () => true) => {
      return allStats
        .filter(s => s[field] !== null && s[field] !== undefined && filter(s))
        .sort((a, b) => parseFloat(b[field]) - parseFloat(a[field]))
        .slice(0, limit)
        .map(s => ({
          player_id: s.player_id,
          name: s.player ? `${s.player.first_name} ${s.player.last_name}` : 'Unknown',
          value: s[field]
        }));
    };

    const eraLeaders = allStats
      .filter(s => s.era !== null && s.era !== undefined && parseFloat(s.innings_pitched) >= 5)
      .sort((a, b) => parseFloat(a.era) - parseFloat(b.era))
      .slice(0, 3)
      .map(s => ({
        player_id: s.player_id,
        name: s.player ? `${s.player.first_name} ${s.player.last_name}` : 'Unknown',
        value: s.era
      }));

    res.json({
      success: true,
      data: {
        record: {
          wins: team.wins || 0,
          losses: team.losses || 0,
          ties: team.ties || 0,
          conference_wins: team.conference_wins || 0,
          conference_losses: team.conference_losses || 0
        },
        team_batting: team.team_batting_stats || {},
        team_pitching: team.team_pitching_stats || {},
        team_fielding: team.team_fielding_stats || {},
        recent_games: recentGames.map(g => ({
          id: g.id,
          date: g.game_date,
          opponent: g.opponent,
          home_away: g.home_away,
          result: g.result,
          score: g.team_score !== null ? `${g.team_score}-${g.opponent_score}` : null,
          game_summary: g.game_summary,
          running_record: g.running_record,
          running_conference_record: g.running_conference_record
        })),
        leaders: {
          batting_avg: leaderFor('batting_average', 3, s => s.at_bats >= 10),
          home_runs: leaderFor('home_runs'),
          rbi: leaderFor('rbi'),
          stolen_bases: leaderFor('stolen_bases'),
          era: eraLeaders,
          strikeouts: leaderFor('strikeouts_pitching')
        },
        stats_last_synced_at: team.stats_last_synced_at
      }
    });
  } catch (error) {
    console.error('Error fetching team dashboard:', error);
    res.status(500).json({ success: false, error: 'Error fetching team dashboard' });
  }
});

/**
 * GET /api/v1/teams/game-log
 * Team game log with per-game team stats and running record.
 */
router.get('/game-log', async (req, res) => {
  try {
    const { Game } = require('../../models');

    const games = await Game.findAll({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      attributes: ['id', 'opponent', 'game_date', 'home_away', 'result',
        'team_score', 'opponent_score', 'team_stats', 'game_summary',
        'running_record', 'running_conference_record', 'location'],
      order: [['game_date', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        games: games.map(g => ({
          id: g.id,
          date: g.game_date,
          opponent: g.opponent,
          home_away: g.home_away,
          result: g.result,
          score: g.team_score !== null ? `${g.team_score}-${g.opponent_score}` : null,
          location: g.location,
          team_stats: g.team_stats,
          game_summary: g.game_summary,
          running_record: g.running_record,
          running_conference_record: g.running_conference_record
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching team game log:', error);
    res.status(500).json({ success: false, error: 'Error fetching team game log' });
  }
});

/**
 * GET /api/v1/teams/aggregate-stats
 * Full team batting/pitching/fielding aggregates.
 */
router.get('/aggregate-stats', async (req, res) => {
  try {
    const { Team } = require('../../models');

    const team = await Team.findByPk(req.user.team_id, {
      attributes: ['team_batting_stats', 'team_pitching_stats', 'team_fielding_stats', 'stats_last_synced_at']
    });

    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    res.json({
      success: true,
      data: {
        batting: team.team_batting_stats || {},
        pitching: team.team_pitching_stats || {},
        fielding: team.team_fielding_stats || {},
        last_synced_at: team.stats_last_synced_at
      }
    });
  } catch (error) {
    console.error('Error fetching team aggregate stats:', error);
    res.status(500).json({ success: false, error: 'Error fetching team aggregate stats' });
  }
});

/**
 * GET /api/v1/teams/lineup
 * Best-effort lineup derived from most recent game's box score.
 */
router.get('/lineup', async (req, res) => {
  try {
    const { Game, GameStatistic, Player } = require('../../models');

    // Find most recent completed game
    const lastGame = await Game.findOne({
      where: {
        team_id: req.user.team_id,
        game_status: 'completed'
      },
      order: [['game_date', 'DESC']]
    });

    if (!lastGame) {
      return res.json({
        success: true,
        data: { source: 'none', players: [], message: 'No completed games found' }
      });
    }

    // Get all players who appeared in that game
    const gameStats = await GameStatistic.findAll({
      where: { game_id: lastGame.id, team_id: req.user.team_id },
      include: [{
        model: Player,
        as: 'player',
        attributes: ['id', 'first_name', 'last_name', 'position', 'jersey_number', 'photo_url']
      }]
    });

    // Sort: position players first (by position), then pitchers
    const positionOrder = { 'C': 1, 'SS': 2, '2B': 3, '3B': 4, '1B': 5, 'LF': 6, 'CF': 7, 'RF': 8, 'DH': 9, 'P': 10 };
    const sorted = gameStats.sort((a, b) => {
      const posA = positionOrder[a.position_played] || 99;
      const posB = positionOrder[b.position_played] || 99;
      return posA - posB;
    });

    res.json({
      success: true,
      data: {
        source: 'last_game',
        game_id: lastGame.id,
        game_date: lastGame.game_date,
        opponent: lastGame.opponent,
        players: sorted.map(gs => ({
          player_id: gs.player?.id,
          name: gs.player ? `${gs.player.first_name} ${gs.player.last_name}` : 'Unknown',
          jersey_number: gs.player?.jersey_number,
          position: gs.position_played,
          photo_url: gs.player?.photo_url,
          batting: {
            ab: gs.at_bats, h: gs.hits, r: gs.runs, rbi: gs.rbi, bb: gs.walks
          }
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching team lineup:', error);
    res.status(500).json({ success: false, error: 'Error fetching team lineup' });
  }
});
```

**Step 4: Run tests**

```bash
docker exec sports2_backend npx jest src/routes/__tests__/team-dashboard.test.js --no-coverage --verbose 2>&1 | tail -30
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/routes/teams/stats.js src/routes/__tests__/team-dashboard.test.js
git commit -m "feat: add team dashboard, game log, aggregate stats, and lineup endpoints"
```

---

## Task 9: Integration Test — Full Sync + API Verification

**Files:**
- No new files — manual verification against Docker environment

**Step 1: Run full sync**

```bash
docker exec sports2_backend node -e "
const prestoSyncService = require('./src/services/prestoSyncService');
prestoSyncService.syncAll(1, 1).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"
```

**Step 2: Verify data in DB**

```bash
# Check split stats
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT p.first_name, p.last_name, pss.split_stats->'home'->'avg' as home_avg, pss.split_stats->'away'->'avg' as away_avg, pss.split_stats->'vs_lhp'->'pct' as vs_lhp FROM player_season_stats pss JOIN players p ON p.id=pss.player_id WHERE pss.split_stats IS NOT NULL LIMIT 5;"

# Check game log
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT opponent, game_summary, running_record, team_stats->'avg' as team_avg FROM games WHERE team_stats IS NOT NULL ORDER BY game_date DESC LIMIT 5;"

# Check team aggregates
docker exec sports2_backend_db psql -U postgres -d sports2 -c "SELECT name, team_batting_stats->'avg' as avg, team_pitching_stats->'era' as era FROM teams WHERE team_batting_stats IS NOT NULL;"
```

**Step 3: Test API endpoints**

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@sports2.com","password":"Admin123!"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('token',''))")

# Dashboard
curl -s http://localhost:5000/api/v1/teams/dashboard -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40

# Team game log
curl -s http://localhost:5000/api/v1/teams/game-log -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -30

# Team aggregates
curl -s http://localhost:5000/api/v1/teams/aggregate-stats -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Lineup
curl -s http://localhost:5000/api/v1/teams/lineup -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Player splits (use first player ID from dashboard leaders)
curl -s "http://localhost:5000/api/v1/players/byId/1/splits" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40

# Player raw stats
curl -s "http://localhost:5000/api/v1/players/byId/1/stats/raw" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

**Step 4: Run full test suite**

```bash
docker exec sports2_backend npm test 2>&1 | tail -20
```

Expected: All existing + new tests pass.

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: verify extended Presto stats integration end-to-end"
```
