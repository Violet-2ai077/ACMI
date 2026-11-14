import { MAX_EVENT_BYTES, MAX_FRAME_EVENTS, MAX_PAYLOAD_BYTES } from './transaction-frame.mjs'
import { CHANNEL_BYTES, REQUEST_BYTES } from './ledger-state.mjs'

// A proof artifact, not a policy provider: no runtime imports this to set limits.
export function capacityProof() {
  const W = 1048576, H = 'f'.repeat(64)
  const metaBytes = index => Buffer.byteLength(JSON.stringify({ kind: 'wire_delivery', elapsed_ms: 180000, index,
    phase: 'generation', byte_length: 1, sha256: H }))
  let metadata = 0
  for (let digits = 1, start = 0; start < W; digits++) {
    const end = Math.min(W, 10 ** digits); metadata += (end - start) * metaBytes(start); start = end
  }
  const body = { seq: Number.MAX_SAFE_INTEGER, previous: H, kind: 'capture', value: { attemptId: H,
    channel: 'transport', bytes_base64: '', sha256: H, elapsedMs: Number.MAX_VALUE }, digest: H }
  const reserve = { ...body, kind: 'reserve', value: { attemptId: H, coordinate: { family_id: 'x'.repeat(100),
    condition: 'C1', arm: 'D', track: 'FROZEN-REPLAY', turn_id: 'x'.repeat(100), stage: 'answer' },
    request_base64: '', request_sha256: H, maxCostMicros: 1000000000000, answer_sha256: H } }
  const sampledMax = Math.max(...[body, reserve].map(v => Buffer.byteLength(JSON.stringify(v))))
  return {
    version: 'fixed-policy-capacity-proof-v1', live_admission_bytes: W, scheduled_calls: 576,
    closed_capacity: false, new_runtime_limits: false, performance_evaluation: false,
    existing: { request_bytes: REQUEST_BYTES, channel_and_capture_bytes: CHANNEL_BYTES, channels: 4,
      generation_ms: 180000, cleanup_ms: 5000, output_tokens: 16384, input_bytes: 131072 },
    structural_bounds: { max_capture_events_per_attempt: MAX_FRAME_EVENTS, max_logical_event_bytes: MAX_EVENT_BYTES,
      max_frame_payload_bytes: MAX_PAYLOAD_BYTES, max_logical_events_per_run: 576 * (MAX_FRAME_EVENTS + 2),
      sampled_max_envelope_bytes: sampledMax, logical_envelope_allowance: 1024,
      derivation: ['Each valid capture is nonempty; four channel sums each <=4194304.',
        'Each captured byte requires at most four Base64 bytes with independent padding.',
        'Strict logical fields have bounded ASCII IDs/hash/channel strings and numeric tokens; 1024 envelope bytes includes conservative numeric/coordinate allowance.',
        'A capture batch cannot include reserve/settle or multiple attempts. Control frames each contain one event.',
        'This broad bound excludes arbitrary whitespace/duplicate keys: binary writer encoding is exact JSON.stringify output.'],
      is_process_memory_guarantee: false,
      limitation: 'The valid-semantic structural bound exceeds practical JS string/Buffer/RSS capacity. Writer payload materialization remains a capacity gap; no smaller limit silently added.' },
    transport_invariants: { maximum_owned_pending_reads: 1, maximum_cleanup_delivered_nonempty_reads: 1,
      generation_nonempty_reads_upper_bound: W + 1,
      justification: 'The next reader.read is issued only after awaiting the current one; cleanup awaits/cancels it and issues no new reads. One Promise yields at most one item. Overshoot aborts before another read.',
      qualification: 'This bounds owned delivery count, not delivered item size, empty-read CPU, provider buffers or Fetch internal allocations.' },
    base64_counterexample: { two_one_byte_records: 8, two_bytes_coalesced: 4 },
    counterexamples: { admitted_prefix_bytes: W, next_read_bytes: 3 * W + 1,
      raw_total_after_delivery: 4 * W + 1, existing_channel_bytes: CHANNEL_BYTES,
      fragmented_metadata_bytes: metadata, fragmented_reads: W,
      metadata_method: 'Exact sum for the stated synthetic wire_delivery JSON format; no millions-of-write replay.' },
    unproved: ['maximum_delivered_read_bytes', 'Fetch_internal_buffering', 'control_record_joint_budget',
      'maximum_transaction_materialization_RSS', 'full_volume_576_slot_disk_and_RSS', 'absolute_full_audit_capacity'],
    inequalities: { raw_evidence: 'W + Q + C (conservative; Q and C not proven in bytes)',
      transport: 'N_raw*M_delivery + M_pre + M_request + M_response + M_terminal <= available transport channel',
      physical_storage: 'sum(4*ceil(b_i/3)) + logical envelopes + 144*transactions + JSON array separators + external artifacts + failure reserve',
      run: 'sum over the unchanged 576 slots, including both D stages exactly once' },
    decision: 'CAPACITY_NOT_CLOSED; no cap promotion, no new guard, no performance authorization, no live readiness'
  }
}
