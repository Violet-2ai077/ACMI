import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freezeDevelopment,verifyFrozenSources } from '../gate2/freeze-development.mjs'
import { verifyFreezeBundle,readVerifiedExecutionInputs,verifiedDependencyDigests } from '../gate2/freeze.mjs'
import { GATE2_EVIDENCE_ROOT } from '../gate2/run-ledger.mjs'
import { hash } from '../protocol/contracts.mjs'
mkdirSync(GATE2_EVIDENCE_ROOT,{recursive:true})
const root=mkdtempSync(join(GATE2_EVIDENCE_ROOT,'package-tests-'))
export const syntheticRuntime={version:'gate2-runtime-v1',model_snapshot:'alias:synthetic-not-a-model',model_identity_kind:'mutable-service-alias',node_version:process.version,
  spending_policy:{mode:'uncapped',authorization_ref:'owner-2026-11-14',scheduled_calls:576},
  route:{version:'gate2-dsh-route-v1',provider:'synthetic',api:'openai-completions',endpoint:'https://synthetic.invalid/v1/chat/completions',model_alias:'synthetic-not-a-model',reasoning_effort:'max',thinking_format:'deepseek',max_tokens_field:'max_tokens',assistant_reasoning_content_required:true,output_tokens_declared:32768},
  max_output_tokens:16384,max_input_bytes:131072,max_response_bytes:1048576,timeout_ms:1000,currency:'USD',pricing_verified:false}
test('development package freezes all actual prompts, oracle, review and dependency bytes',()=>{
  const f=freezeDevelopment({root,packageId:'complete',runtime:syntheticRuntime,purpose:'synthetic-test'})
  assert.equal(f.report.corpus_preflight_passed,true)
  assert.equal(f.report.full_package_review_binding_verified,true)
  assert.equal(f.report.review_independence_verified,false)
  assert.equal(verifyFrozenSources(f.report),true)
  const inputs=readVerifiedExecutionInputs(f.report)
  assert.equal(inputs.filter(x=>x.role==='prompt').length,4)
  assert.equal(inputs.some(x=>['oracle','review','authorization','evaluator'].includes(x.role)),false)
  assert.throws(()=>readVerifiedExecutionInputs(JSON.parse(JSON.stringify(f.report))),/genuine/)
  const prompt=inputs.find(x=>x.path==='prompts/a.txt'), original=Buffer.from(prompt.bytes)
  prompt.bytes.fill(0)
  assert.deepEqual(readVerifiedExecutionInputs(f.report).find(x=>x.path==='prompts/a.txt').bytes,original)
  assert.equal(JSON.parse(readFileSync(f.pinPath)).manifest_sha256,f.expectedManifestHash)
  assert.throws(()=>freezeDevelopment({root,packageId:'complete',runtime:syntheticRuntime}),/exist/)
  assert.ok(verifiedDependencyDigests(f.report).length>10)
})
test('prompt alteration, even with rebuilt file and manifest hashes, invalidates the full review binding',()=>{
  const f=freezeDevelopment({root,packageId:'tamper',runtime:syntheticRuntime,purpose:'synthetic-test'})
  const manifest=JSON.parse(readFileSync(f.manifestPath)), file=manifest.files.find(x=>x.path==='prompts/a.txt')
  const raw=Buffer.from('changed prompt');writeFileSync(join(root,'tamper',file.path),raw)
  file.sha256=hash(raw);file.bytes=raw.length
  const updated=JSON.stringify(manifest);writeFileSync(f.manifestPath,updated)
  assert.throws(()=>verifyFreezeBundle({manifestPath:f.manifestPath,expectedManifestHash:hash(updated)}),/review binding/)
})
