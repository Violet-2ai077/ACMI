import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync,mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { freezeDevelopment } from '../gate2/freeze-development.mjs'
import { verifyOfflinePrefix } from '../gate2/offline-verification.mjs'
import { GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'

test('frozen prefix runs both protocols, D1/D2, C0 and handoff across ledger reopens without network',async()=>{
  mkdirSync(GATE2_EVIDENCE_ROOT,{recursive:true})
  const root=mkdtempSync(join(GATE2_EVIDENCE_ROOT,'e2e-tests-'))
  const runtime={version:'gate2-runtime-v1',model_snapshot:'alias:synthetic-not-a-model',model_identity_kind:'mutable-service-alias',node_version:process.version,
    spending_policy:{mode:'uncapped',authorization_ref:'owner-2026-11-14',scheduled_calls:576},route:{version:'gate2-dsh-route-v1',provider:'synthetic',api:'openai-completions',endpoint:'https://synthetic.invalid/v1/chat/completions',model_alias:'synthetic-not-a-model',reasoning_effort:'max',thinking_format:'deepseek',max_tokens_field:'max_tokens',assistant_reasoning_content_required:true,output_tokens_declared:32768},
    max_output_tokens:16384,max_input_bytes:131072,max_response_bytes:1048576,timeout_ms:30000,currency:'USD',pricing_verified:false,
    routing_policy:{version:'opencode-conversation-v1',user_agent:'acmi-attribution-research/0.9.19'}}
  const bundle=freezeDevelopment({root,packageId:'test-package',runtime,purpose:'synthetic-test'})
  const {report}=await verifyOfflinePrefix({bundle,root,runId:'prefix',count:19})
  assert.equal(report.actual_model_calls,0)
  assert.equal(report.complete_schedule_executed,false)
  assert.deepEqual(new Set(report.rows.map(r=>r.coordinate.arm)),new Set(['A','B','C0','D']))
  assert.ok(report.rows.some(r=>r.coordinate.arm==='D'&&r.coordinate.stage==='marker'&&r.oracle_conformance_verified))
  assert.ok(report.rows.some(r=>r.session_id==='s2'))
})
