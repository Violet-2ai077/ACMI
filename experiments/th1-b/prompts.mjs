// TH1-B Prompts (RECEIVER_C0, RECEIVER_C1, COMPRESSOR_STRICT)
// Zero external dependencies.

// Verbatim TH1 original receiver system prompt
export const RECEIVER_C0 =
  'Use only the supplied evidence to fulfill the job. Output only JSON {"trail":["code1","code2"],"print_line":"latestCode/seal/footer"}. trail lists the actual print code changes from first to last, no duplicate acknowledgements. print_line is a single label ready to print, literal values separated by slash without spaces. Use UNKNOWN for each unavailable value. Distinguish global footer updates from job-local rules.';

// Single-factor addition on top of RECEIVER_C0: Explicit Authority Contract
export const RECEIVER_C1 =
  `${RECEIVER_C0} Authority contract: \`memory\` is the workspace's latest authoritative global state, and \`source\` is the global conversation turn number. If any global rule (such as \`footer\`) in \`transcript\` or \`note\` conflicts with \`memory\` (including when \`memory.source\` is later than the transcript turn, when later local turns occur after \`memory.source\`, or when a summary \`note\` omits turn numbers), unconditionally follow \`memory\`. Task-local fields (\`trail\`, \`seal\`) must never be overridden by \`memory\` or by another job's local state.`;

// Verbatim TH1 original compressor system prompt (for reference)
export const COMPRESSOR_C0 =
  'Compact the supplied job transcript into a short handoff note (plain text). Preserve the ordered revisions of the print code, the job seal, and the latest operative decision; discard repeated acknowledgements. Workspace memory is supplied separately to the receiver. Do not infer missing facts.';

// Strict boundary-enforced compressor prompt: prohibits writing workspace-wide / standing global rules into the handoff note
export const COMPRESSOR_STRICT =
  `${COMPRESSOR_C0} Strict prohibition: Do NOT write any workspace-wide or standing global rules (such as workspace footer settings or footer values) into the handoff note. Only summarize the target job's local print code revision order and job-only seal.`;

export const PROMPTS = Object.freeze({
  RECEIVER_C0,
  RECEIVER_C1,
  COMPRESSOR_C0,
  COMPRESSOR_STRICT
});
