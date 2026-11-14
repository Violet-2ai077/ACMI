import { hash } from '../protocol/contracts.mjs'

export function checkedRoutingHeaders(headers,digest=hash(headers)) {
  if(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.keys(headers).sort().join('|')!=='user-agent|x-opencode-session'||
    headers['user-agent']!=='acmi-attribution-research/0.9.19'||!/^acmi-[a-f0-9]{48}$/.test(headers['x-opencode-session'])||hash(headers)!==digest)throw new Error('invalid routing headers')
  return {...headers}
}

export function routingHeadersFor({policy,runId,freezeHash,coordinate:c,sessionId}) {
  if(!policy||Object.keys(policy).sort().join('|')!=='user_agent|version'||policy.version!=='opencode-conversation-v1'||policy.user_agent!=='acmi-attribution-research/0.9.19'||
    !/^[a-f0-9]{64}$/.test(freezeHash)||![runId,sessionId,c?.family_id,c?.condition,c?.arm,c?.track].every(x=>typeof x==='string'&&x.length))throw new Error('invalid routing policy')
  // A logical task ID is deliberately not a routing/session identity.
  const key=[policy.version,freezeHash,runId,c.family_id,c.condition,c.arm,c.track,sessionId,
    c.track==='FROZEN-REPLAY'?c.turn_id:null]
  return checkedRoutingHeaders({'user-agent':policy.user_agent,'x-opencode-session':'acmi-'+hash(key).slice(0,48)})
}
