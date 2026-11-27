import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/db.js';
import type { AppEnv } from '../src/config/env.js';
import { loadEnv } from '../src/config/env.js';
import { Application } from '../src/models/Application.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { buildTestDbUri } from './helpers.js';

const TEST_DB_NAME = 'volunteer_hours_test_phase20_indexes';

function indexKeys(model: typeof Application | typeof Opportunity): string[] {
  return model.schema.indexes().map(([keys]) => JSON.stringify(keys));
}

interface ExplainStage {
  stage?: string;
  indexName?: string;
  inputStage?: ExplainStage;
  inputStages?: ExplainStage[];
}

function planUsesIndex(stage: ExplainStage | undefined, indexName: string): boolean {
  if (!stage) {
    return false;
  }
  if (stage.stage === 'IXSCAN' && stage.indexName === indexName) {
    return true;
  }
  if (planUsesIndex(stage.inputStage, indexName)) {
    return true;
  }
  return (stage.inputStages ?? []).some((child) => planUsesIndex(child, indexName));
}

describe('Phase 20 — audit indexes (A2, A6, A12)', () => {
  let env: AppEnv;

  before(async () => {
    env = loadEnv();
    await connectDatabase(buildTestDbUri(env.mongoUri, TEST_DB_NAME));
    assert.equal(mongoose.connection.name, TEST_DB_NAME);
    await mongoose.connection.dropDatabase();
    await mongoose.syncIndexes();
  });

  after(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB_NAME) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('application_schema_declares_the_user_appliedAt_compound_index', () => {
    assert.ok(
      indexKeys(Application).includes(JSON.stringify({ user: 1, appliedAt: -1 })),
      'Application must index {user:1, appliedAt:-1} for the student hot paths'
    );
  });

  it('opportunity_schema_declares_status_endAt_fields_and_deputy_indexes', () => {
    const keys = indexKeys(Opportunity);
    assert.ok(keys.includes(JSON.stringify({ status: 1, endAt: -1 })));
    assert.ok(keys.includes(JSON.stringify({ fields: 1 })));
    const deputyIndex = Opportunity.schema
      .indexes()
      .find(([indexKeysObj]) => JSON.stringify(indexKeysObj) === JSON.stringify({ attendanceDeputy: 1 }));
    assert.ok(deputyIndex, 'attendanceDeputy index must exist');
    assert.equal(deputyIndex?.[1]?.sparse, true);
  });

  it('stats_me_style_query_is_served_by_the_user_index_not_a_collection_scan', async () => {
    const userId = new mongoose.Types.ObjectId();
    const opportunityId = new mongoose.Types.ObjectId();
    const volunteerId = new mongoose.Types.ObjectId();
    // Enough rows for the planner to prefer the index over a scan.
    const docs = Array.from({ length: 60 }, (_, index) => ({
      opportunity: opportunityId,
      volunteer: volunteerId,
      user: index % 3 === 0 ? userId : new mongoose.Types.ObjectId(),
      faculty: 'كلية الطب البشري',
      category: 'student' as const,
      status: 'pending' as const,
      appliedAt: new Date(Date.now() - index * 60_000),
    }));
    // The unique {opportunity, volunteer} index forbids reusing one pair.
    docs.forEach((doc, index) => {
      doc.volunteer = new mongoose.Types.ObjectId();
      void index;
    });
    await Application.insertMany(docs);

    const explained = (await Application.find({ user: userId })
      .sort({ appliedAt: -1, createdAt: -1 })
      .explain('executionStats')) as unknown as {
      executionStats?: { executionStages?: ExplainStage };
      queryPlanner?: { winningPlan?: ExplainStage };
    };
    const plan = explained.queryPlanner?.winningPlan;
    assert.ok(
      planUsesIndex(plan, 'user_1_appliedAt_-1'),
      `expected the winning plan to use user_1_appliedAt_-1, got: ${JSON.stringify(plan)}`
    );
  });
});
