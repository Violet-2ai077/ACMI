// TC3-B Deterministic Header & Proper-Noun Stripper (S2_strip_cot_and_header)
// Pure function applied ONLY to historical assistant responses before pushing into next-turn history.
// Strictly preserves trailing <|task:N|> marker and all business/content facts checked by answerChecks.

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      freezeDeep(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// Exact proper nouns extracted from continuity-natural-v1/materials.mjs (longer strings first)
export const FROZEN_PROPER_NOUN_RULES = freezeDeep([
  { pattern: '云栖读书会', replacement: '该项目', role: 'Task 1 (south-confirmation) & Task 3 (paid-receipt) client entity' },
  { pattern: '云溪读书会', replacement: '该项目', role: 'Task 2 (north-confirmation) & Task 4 (unpaid-reminder) client entity' },
  { pattern: '溪岸书店', replacement: '该项目', role: 'Task 5 (pickup-notice) client entity' },
  { pattern: '云栖', replacement: '该项目', role: 'Short client proper noun (Yunqi)' },
  { pattern: '云溪', replacement: '该项目', role: 'Short client proper noun (Yunxi)' },
  { pattern: '溪岸', replacement: '该项目', role: 'Short client proper noun (Xi-an)' }
]);

// Matches leading bracketed headers such as 【云栖读书会】 or [溪岸书店]： at start of line,
// while excluding any brackets containing digits (0-9) so time/amount emphasis like 【周五18:00】 is never stripped.
export const LEADING_HEADER_REGEX = /^[ \t]*(?:【[^】0-9\r\n]{1,24}】|\[[^\]0-9\r\n]{1,24}\])[ \t]*[：:]?[ \t]*/gm;

// Matches the trailing task marker at the end of an assistant message so it is never modified.
const TRAILING_MARKER_CAPTURE_REGEX = /(\s*<\|task:(?:[1-9][0-9]{0,2}|UNRESOLVED)\|>)\s*$/;

export function stripExplicitHeaders(content) {
  const raw = String(content ?? '');
  const markerMatch = raw.match(TRAILING_MARKER_CAPTURE_REGEX);

  let body = raw;
  let trailingMarkerPart = '';

  if (markerMatch && markerMatch.index !== undefined) {
    body = raw.slice(0, markerMatch.index);
    trailingMarkerPart = markerMatch[1];
  }

  // Step 1: Strip leading bracketed headers like 【云栖读书会】 or [云溪读书会]：
  let cleanedBody = body.replace(LEADING_HEADER_REGEX, '');

  // Step 2: Neutralize all frozen client/project proper nouns in the body
  for (const rule of FROZEN_PROPER_NOUN_RULES) {
    cleanedBody = cleanedBody.replaceAll(rule.pattern, rule.replacement);
  }

  return `${cleanedBody}${trailingMarkerPart}`;
}

// Frozen representative examples from original TC3 (evidence/24-overlapping-notices-t24-a1/input.json)
export const FROZEN_STRIP_EXAMPLES = freezeDeep([
  {
    turn: 1,
    task_key: 'south-confirmation',
    before: '【云栖读书会】您已报名成功！活动将于本周六14:00在南馆三楼开始，请自带纸质书按时参加，期待与您相见。\n<|task:1|>',
    after: '您已报名成功！活动将于本周六14:00在南馆三楼开始，请自带纸质书按时参加，期待与您相见。\n<|task:1|>'
  },
  {
    turn: 2,
    task_key: 'north-confirmation',
    before: '【云溪读书会】您已报名成功！活动将于本周日10:00在北馆二楼举行，请自带铅笔以便现场做阅读批注，期待您的参与。\n<|task:2|>',
    after: '您已报名成功！活动将于本周日10:00在北馆二楼举行，请自带铅笔以便现场做阅读批注，期待您的参与。\n<|task:2|>'
  },
  {
    turn: 4,
    task_key: 'paid-receipt',
    before: '主题：云栖读书会收款确认\n\n您好！我们已收到您缴纳的云栖读书会报名费68元，非常感谢您的支持与参与。\n\n云栖读书会\n<|task:3|>',
    after: '主题：该项目收款确认\n\n您好！我们已收到您缴纳的该项目报名费68元，非常感谢您的支持与参与。\n\n该项目\n<|task:3|>'
  },
  {
    turn: 5,
    task_key: 'unpaid-reminder',
    before: '【云溪读书会】温馨提醒：您的读书会报名费48元尚未完成支付，请于本周五18:00前办理，感谢您的配合。\n<|task:4|>',
    after: '温馨提醒：您的读书会报名费48元尚未完成支付，请于本周五18:00前办理，感谢您的配合。\n<|task:4|>'
  },
  {
    turn: 7,
    task_key: 'pickup-notice',
    before: '【溪岸书店】您好，您的订单P52所购图书已备好，请于周一19:00前到自提柜B3领取，感谢惠顾。\n<|task:5|>',
    after: '您好，您的订单P52所购图书已备好，请于周一19:00前到自提柜B3领取，感谢惠顾。\n<|task:5|>'
  },
  {
    turn: 10,
    task_key: 'unpaid-reminder',
    before: '【云溪读书会】温馨提醒：您的48元报名费请于【周五18:00】前完成支付。如您方便请及时办理，感谢配合！\n<|task:4|>',
    after: '温馨提醒：您的48元报名费请于【周五18:00】前完成支付。如您方便请及时办理，感谢配合！\n<|task:4|>'
  }
]);
