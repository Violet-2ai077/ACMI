// TH1-B Frozen Scenarios (V0–V7)
// Zero external dependencies. Deterministic single-factor ablation corpus.

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      freezeDeep(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const RAW_SCENARIOS = [
  // =========================================================================
  // V0: Exact reconstruction of TH1 Variant 0
  // Target job: Alder (turns 1, 3); Global footer updated by Birch at turn 4.
  // Truth: trail ["K14","N72"], print_line "N72/S58/M94", stale footer ["M16"]
  // =========================================================================
  {
    id: 'V0',
    family: 'th1-original',
    title: 'TH1 Variant 0 Exact Reconstruction (memory.source=4 > last_local=3)',
    target_job: 'Alder',
    local_turns: [1, 3],
    memory_source_turn: 4,
    temporal_order: 'memory_after_local',
    stale_footers: ['M16'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['K14', 'N72'],
      latest_code: 'N72',
      seal: 'S58',
      footer: 'M94',
      print_line: 'N72/S58/M94'
    },
    memory: [
      { key: 'footer', value: 'M94', source: 4 }
    ],
    // Exact TH1 assembly-0 packets
    filtered: {
      transcript: [
        {
          id: 1,
          user: 'Open the Alder print job. Start its print code at K14; its seal is S58, only for this job. Set the standing footer on every workspace job to M16.',
          answer: 'Alder is open with print code K14 and job-only seal S58, and the workspace-wide footer is now M16.'
        },
        {
          id: 3,
          user: 'On the Alder proof replace its earlier print code with N72. Retain its seal. Confirm the change.',
          answer: "Alder's print code is now N72, replacing K14, and its job-only seal S58 is retained."
        }
      ],
      memory: [
        { key: 'footer', value: 'M94', source: 4 }
      ]
    },
    compact: {
      note: 'Alder print job handoff:\n- Print code revisions, in order: K14 → N72 (current: N72, replacing K14).\n- Job seal: S58, job-only; retained.\n- Workspace-wide standing footer on every job: M16.\n- Latest operative decision: Alder uses print code N72 with seal S58 retained.',
      memory: [
        { key: 'footer', value: 'M94', source: 4 }
      ]
    },
    gold: {
      note: 'Alder: print code K14 then N72; seal S58.',
      memory: [
        { key: 'footer', value: 'M94', source: 4 }
      ]
    },
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at K14; its seal is S58, only for this job. Set the standing footer on every workspace job to M16.',
            answer: 'Alder is open with print code K14 and job-only seal S58, and the workspace-wide footer is now M16.'
          },
          {
            id: 3,
            user: 'On the Alder proof replace its earlier print code with N72. Retain its seal. Confirm the change.',
            answer: "Alder's print code is now N72, replacing K14, and its job-only seal S58 is retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'M94', source: 4 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at K14; its seal is S58, only for this job.',
            answer: 'Alder is open with print code K14 and job-only seal S58.'
          },
          {
            id: 3,
            user: 'On the Alder proof replace its earlier print code with N72. Retain its seal. Confirm the change.',
            answer: "Alder's print code is now N72, replacing K14, and its job-only seal S58 is retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'M94', source: 4 }
        ]
      },
      compact_P0: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: K14 → N72 (current: N72, replacing K14).\n- Job seal: S58, job-only; retained.\n- Workspace-wide standing footer on every job: M16.\n- Latest operative decision: Alder uses print code N72 with seal S58 retained.',
        memory: [
          { key: 'footer', value: 'M94', source: 4 }
        ]
      },
      compact_P1: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: K14 → N72 (current: N72, replacing K14).\n- Job seal: S58, job-only; retained.\n- Latest operative decision: Alder uses print code N72 with seal S58 retained.',
        memory: [
          { key: 'footer', value: 'M94', source: 4 }
        ]
      }
    }
  },

  // =========================================================================
  // V1: Exact reconstruction of TH1 Variant 1
  // Target job: Alder (turns 2, 4); Global footer updated by Birch at turn 3.
  // Truth: trail ["P83","J26"], print_line "J26/S31/M16", stale footer ["M94"]
  // =========================================================================
  {
    id: 'V1',
    family: 'th1-original',
    title: 'TH1 Variant 1 Exact Reconstruction (memory.source=3 < last_local=4)',
    target_job: 'Alder',
    local_turns: [2, 4],
    memory_source_turn: 3,
    temporal_order: 'local_after_memory',
    stale_footers: ['M94'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['P83', 'J26'],
      latest_code: 'J26',
      seal: 'S31',
      footer: 'M16',
      print_line: 'J26/S31/M16'
    },
    memory: [
      { key: 'footer', value: 'M16', source: 3 }
    ],
    // Exact TH1 assembly-1 packets
    filtered: {
      transcript: [
        {
          id: 2,
          user: 'Open the Alder print job. Start its print code at P83; its seal is S31, only for this job. Set the standing footer on every workspace job to M94.',
          answer: 'The Alder print job is open with its print code starting at P83 and seal S31 applied only to this job, and the workspace-wide standing footer is set to M94.'
        },
        {
          id: 4,
          user: 'On the Alder proof replace its earlier print code with J26. Retain its seal. Confirm the change.',
          answer: 'Confirmed: the Alder proof’s print code is now J26, and its seal S31 is retained.'
        }
      ],
      memory: [
        { key: 'footer', value: 'M16', source: 3 }
      ]
    },
    compact: {
      note: 'Alder print job:\n- Print code revisions, in order: P83 → J26. Latest operative print code: J26.\n- Job seal: S31, for this job only; retained after print-code revision.\n- Workspace standing footer: M94 on every workspace job.',
      memory: [
        { key: 'footer', value: 'M16', source: 3 }
      ]
    },
    gold: {
      note: 'Alder: print code P83 then J26; seal S31.',
      memory: [
        { key: 'footer', value: 'M16', source: 3 }
      ]
    },
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at P83; its seal is S31, only for this job. Set the standing footer on every workspace job to M94.',
            answer: 'The Alder print job is open with its print code starting at P83 and seal S31 applied only to this job, and the workspace-wide standing footer is set to M94.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with J26. Retain its seal. Confirm the change.',
            answer: 'Confirmed: the Alder proof’s print code is now J26, and its seal S31 is retained.'
          }
        ],
        memory: [
          { key: 'footer', value: 'M16', source: 3 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at P83; its seal is S31, only for this job.',
            answer: 'The Alder print job is open with its print code starting at P83 and seal S31 applied only to this job.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with J26. Retain its seal. Confirm the change.',
            answer: 'Confirmed: the Alder proof’s print code is now J26, and its seal S31 is retained.'
          }
        ],
        memory: [
          { key: 'footer', value: 'M16', source: 3 }
        ]
      },
      compact_P0: {
        note: 'Alder print job:\n- Print code revisions, in order: P83 → J26. Latest operative print code: J26.\n- Job seal: S31, for this job only; retained after print-code revision.\n- Workspace standing footer: M94 on every workspace job.',
        memory: [
          { key: 'footer', value: 'M16', source: 3 }
        ]
      },
      compact_P1: {
        note: 'Alder print job:\n- Print code revisions, in order: P83 → J26. Latest operative print code: J26.\n- Job seal: S31, for this job only; retained after print-code revision.',
        memory: [
          { key: 'footer', value: 'M16', source: 3 }
        ]
      }
    }
  },

  // =========================================================================
  // V2: Sandwich Counterbalanced Scenario A (Alder opens turn 1, finishes turn 4;
  // global footer updated at turn 3; codes R41->T95, seal S62, footer F28->F73)
  // =========================================================================
  {
    id: 'V2',
    family: 'sandwich-counterbalanced',
    title: 'Sandwich Counterbalanced A (Alder turns 1,4 sandwich memory.source=3)',
    target_job: 'Alder',
    local_turns: [1, 4],
    memory_source_turn: 3,
    temporal_order: 'local_after_memory',
    stale_footers: ['F28'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['R41', 'T95'],
      latest_code: 'T95',
      seal: 'S62',
      footer: 'F73',
      print_line: 'T95/S62/F73'
    },
    memory: [
      { key: 'footer', value: 'F73', source: 3 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at R41; its seal is S62, only for this job. Set the standing footer on every workspace job to F28.',
            answer: 'Alder is open with print code R41 and job-only seal S62, and the workspace-wide standing footer is set to F28.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with T95. Retain its seal. Confirm the change.',
            answer: "Confirmed: Alder's print code is now T95, replacing R41, with job-only seal S62 retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'F73', source: 3 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at R41; its seal is S62, only for this job.',
            answer: 'Alder is open with print code R41 and job-only seal S62.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with T95. Retain its seal. Confirm the change.',
            answer: "Confirmed: Alder's print code is now T95, replacing R41, with job-only seal S62 retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'F73', source: 3 }
        ]
      },
      compact_P0: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: R41 → T95 (latest operative code: T95).\n- Job seal: S62, for this job only; retained.\n- Workspace standing footer: F28 on every workspace job.\n- Latest operative decision: Alder uses print code T95 with seal S62 retained.',
        memory: [
          { key: 'footer', value: 'F73', source: 3 }
        ]
      },
      compact_P1: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: R41 → T95 (latest operative code: T95).\n- Job seal: S62, for this job only; retained.\n- Latest operative decision: Alder uses print code T95 with seal S62 retained.',
        memory: [
          { key: 'footer', value: 'F73', source: 3 }
        ]
      }
    }
  },

  // =========================================================================
  // V3: Sandwich Counterbalanced Scenario B (Alder opens turn 2, finishes turn 5;
  // global footer updated at turn 3; codes W19->C64, seal S85, footer F73->F28)
  // =========================================================================
  {
    id: 'V3',
    family: 'sandwich-counterbalanced',
    title: 'Sandwich Counterbalanced B (Alder turns 2,5 sandwich memory.source=3)',
    target_job: 'Alder',
    local_turns: [2, 5],
    memory_source_turn: 3,
    temporal_order: 'local_after_memory',
    stale_footers: ['F73'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['W19', 'C64'],
      latest_code: 'C64',
      seal: 'S85',
      footer: 'F28',
      print_line: 'C64/S85/F28'
    },
    memory: [
      { key: 'footer', value: 'F28', source: 3 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at W19; its seal is S85, only for this job. Set the standing footer on every workspace job to F73.',
            answer: 'The Alder print job is open with print code W19 and job-only seal S85, and the workspace-wide standing footer is now F73.'
          },
          {
            id: 5,
            user: 'On the Alder proof replace its earlier print code with C64. Retain its seal. Confirm the change.',
            answer: "Confirmed: the Alder proof's print code is now C64, replacing W19, and its job-only seal S85 is retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'F28', source: 3 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at W19; its seal is S85, only for this job.',
            answer: 'The Alder print job is open with print code W19 and job-only seal S85.'
          },
          {
            id: 5,
            user: 'On the Alder proof replace its earlier print code with C64. Retain its seal. Confirm the change.',
            answer: "Confirmed: the Alder proof's print code is now C64, replacing W19, and its job-only seal S85 is retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'F28', source: 3 }
        ]
      },
      compact_P0: {
        note: 'Alder print job:\n- Print code revisions, in order: W19 → C64. Latest operative print code: C64.\n- Job seal: S85, for this job only; retained after print-code revision.\n- Workspace standing footer: F73 on every workspace job.\n- Latest operative decision: Alder uses print code C64 with seal S85 retained.',
        memory: [
          { key: 'footer', value: 'F28', source: 3 }
        ]
      },
      compact_P1: {
        note: 'Alder print job:\n- Print code revisions, in order: W19 → C64. Latest operative print code: C64.\n- Job seal: S85, for this job only; retained after print-code revision.\n- Latest operative decision: Alder uses print code C64 with seal S85 retained.',
        memory: [
          { key: 'footer', value: 'F28', source: 3 }
        ]
      }
    }
  },

  // =========================================================================
  // V4: Two-Hop Global Override Scenario A
  // Global footer evolves old1 (G12, turn 1) -> old2 (G45, turn 3) -> final (G98, turn 5).
  // Alder local history contains BOTH old1 (G12) and old2 (G45).
  // =========================================================================
  {
    id: 'V4',
    family: 'two-hop-override',
    title: 'Two-Hop Global Override A (G12 -> G45 in local history, final G98 in memory@5)',
    target_job: 'Alder',
    local_turns: [1, 3],
    memory_source_turn: 5,
    temporal_order: 'two_hop_memory_after_local',
    stale_footers: ['G12', 'G45'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['D34', 'H89'],
      latest_code: 'H89',
      seal: 'S71',
      footer: 'G98',
      print_line: 'H89/S71/G98'
    },
    memory: [
      { key: 'footer', value: 'G98', source: 5 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at D34; its seal is S71, only for this job. Set the standing footer on every workspace job to G12.',
            answer: 'Alder is open with print code D34 and job-only seal S71, and the workspace-wide standing footer is set to G12.'
          },
          {
            id: 3,
            user: 'On the Alder proof replace its earlier print code with H89 and retain its local seal. Also update the standing footer on all workspace jobs to G45, superseding G12.',
            answer: "Alder's print code is now H89, replacing D34, with job-only seal S71 retained; the workspace-wide standing footer is updated to G45, superseding G12."
          }
        ],
        memory: [
          { key: 'footer', value: 'G98', source: 5 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at D34; its seal is S71, only for this job.',
            answer: 'Alder is open with print code D34 and job-only seal S71.'
          },
          {
            id: 3,
            user: 'On the Alder proof replace its earlier print code with H89 and retain its local seal.',
            answer: "Alder's print code is now H89, replacing D34, with job-only seal S71 retained."
          }
        ],
        memory: [
          { key: 'footer', value: 'G98', source: 5 }
        ]
      },
      compact_P0: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: D34 → H89 (current: H89, replacing D34).\n- Job seal: S71, job-only; retained.\n- Workspace-wide standing footer revisions in transcript: initially G12, then updated to G45 (superseding G12).\n- Latest operative decision: Alder uses print code H89 with seal S71 retained.',
        memory: [
          { key: 'footer', value: 'G98', source: 5 }
        ]
      },
      compact_P1: {
        note: 'Alder print job handoff:\n- Print code revisions, in order: D34 → H89 (current: H89, replacing D34).\n- Job seal: S71, job-only; retained.\n- Latest operative decision: Alder uses print code H89 with seal S71 retained.',
        memory: [
          { key: 'footer', value: 'G98', source: 5 }
        ]
      }
    }
  },

  // =========================================================================
  // V5: Two-Hop Global Override Scenario B (Counterbalanced)
  // Global footer evolves old1 (G98, turn 2) -> old2 (G45, turn 4) -> final (G12, turn 5).
  // Alder local history contains BOTH old1 (G98) and old2 (G45).
  // =========================================================================
  {
    id: 'V5',
    family: 'two-hop-override',
    title: 'Two-Hop Global Override B (G98 -> G45 in local history, final G12 in memory@5)',
    target_job: 'Alder',
    local_turns: [2, 4],
    memory_source_turn: 5,
    temporal_order: 'two_hop_memory_after_local',
    stale_footers: ['G98', 'G45'],
    distractor_seals: [],
    distractor_codes: [],
    expected: {
      trail: ['L52', 'Q17'],
      latest_code: 'Q17',
      seal: 'S24',
      footer: 'G12',
      print_line: 'Q17/S24/G12'
    },
    memory: [
      { key: 'footer', value: 'G12', source: 5 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at L52; its seal is S24, only for this job. Set the standing footer on every workspace job to G98.',
            answer: 'The Alder print job is open with print code L52 and job-only seal S24, and the workspace-wide standing footer is set to G98.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with Q17 and retain its local seal. Separately update the standing footer on all workspace jobs to G45, superseding G98.',
            answer: 'Confirmed: Alder print code is now Q17, replacing L52, with job-only seal S24 retained, and the workspace-wide standing footer is now G45, superseding G98.'
          }
        ],
        memory: [
          { key: 'footer', value: 'G12', source: 5 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at L52; its seal is S24, only for this job.',
            answer: 'The Alder print job is open with print code L52 and job-only seal S24.'
          },
          {
            id: 4,
            user: 'On the Alder proof replace its earlier print code with Q17 and retain its local seal.',
            answer: 'Confirmed: Alder print code is now Q17, replacing L52, with job-only seal S24 retained.'
          }
        ],
        memory: [
          { key: 'footer', value: 'G12', source: 5 }
        ]
      },
      compact_P0: {
        note: 'Alder print job:\n- Print code revisions, in order: L52 → Q17. Latest operative print code: Q17.\n- Job seal: S24, for this job only; retained after print-code revision.\n- Workspace standing footer history: started at G98, then revised to G45 on every workspace job.\n- Latest operative decision: Alder uses print code Q17 with seal S24 retained.',
        memory: [
          { key: 'footer', value: 'G12', source: 5 }
        ]
      },
      compact_P1: {
        note: 'Alder print job:\n- Print code revisions, in order: L52 → Q17. Latest operative print code: Q17.\n- Job seal: S24, for this job only; retained after print-code revision.\n- Latest operative decision: Alder uses print code Q17 with seal S24 retained.',
        memory: [
          { key: 'footer', value: 'G12', source: 5 }
        ]
      }
    }
  },

  // =========================================================================
  // V6: Negative / Anti-Overcorrection Scenario A
  // Another task (Birch) modifies its own local seal (S99) and code (X88) at a
  // later turn (turn 5) and is mentioned as a distractor in local text.
  // Tests that the authority contract updates footer to M81 without corrupting
  // Alder's local seal (S44) or trail (["B23","E67"]).
  // =========================================================================
  {
    id: 'V6',
    family: 'negative-anti-overcorrection',
    title: 'Anti-Overcorrection A (Birch later turn-5 seal S99 / code X88 distractor)',
    target_job: 'Alder',
    local_turns: [1, 3],
    memory_source_turn: 4,
    temporal_order: 'distractor_later_other_job_local_edit',
    stale_footers: ['M35'],
    distractor_seals: ['S99'],
    distractor_codes: ['X88'],
    expected: {
      trail: ['B23', 'E67'],
      latest_code: 'E67',
      seal: 'S44',
      footer: 'M81',
      print_line: 'E67/S44/M81'
    },
    memory: [
      { key: 'footer', value: 'M81', source: 4 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at B23; its seal is S44, only for this job. Set the standing footer on every workspace job to M35.',
            answer: 'Alder is open with print code B23 and job-only seal S44, and the workspace-wide standing footer is set to M35.'
          },
          {
            id: 3,
            user: "On the Alder proof replace its earlier print code with E67 and retain Alder's job-only seal S44 (note: even if Birch later changes Birch's own local seal to S99 and Birch's print code to X88 in turn 5, that is strictly for Birch and must not alter Alder).",
            answer: "Alder's print code is now E67, replacing B23, and Alder's job-only seal S44 is retained (Birch's separate turn-5 local seal S99 and code X88 apply only to Birch)."
          }
        ],
        memory: [
          { key: 'footer', value: 'M81', source: 4 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 1,
            user: 'Open the Alder print job. Start its print code at B23; its seal is S44, only for this job.',
            answer: 'Alder is open with print code B23 and job-only seal S44.'
          },
          {
            id: 3,
            user: "On the Alder proof replace its earlier print code with E67 and retain Alder's job-only seal S44 (note: even if Birch later changes Birch's own local seal to S99 and Birch's print code to X88 in turn 5, that is strictly for Birch and must not alter Alder).",
            answer: "Alder's print code is now E67, replacing B23, and Alder's job-only seal S44 is retained (Birch's separate turn-5 local seal S99 and code X88 apply only to Birch)."
          }
        ],
        memory: [
          { key: 'footer', value: 'M81', source: 4 }
        ]
      },
      compact_P0: {
        note: "Alder print job handoff:\n- Print code revisions, in order: B23 → E67 (current: E67, replacing B23).\n- Job seal: S44, job-only for Alder; retained (distractor note: Birch's later turn-5 local seal S99 and code X88 belong only to Birch).\n- Workspace-wide standing footer on every job: M35.\n- Latest operative decision: Alder uses print code E67 with job-only seal S44 retained.",
        memory: [
          { key: 'footer', value: 'M81', source: 4 }
        ]
      },
      compact_P1: {
        note: "Alder print job handoff:\n- Print code revisions, in order: B23 → E67 (current: E67, replacing B23).\n- Job seal: S44, job-only for Alder; retained (distractor note: Birch's later turn-5 local seal S99 and code X88 belong only to Birch).\n- Latest operative decision: Alder uses print code E67 with job-only seal S44 retained.",
        memory: [
          { key: 'footer', value: 'M81', source: 4 }
        ]
      }
    }
  },

  // =========================================================================
  // V7: Negative / Anti-Overcorrection Scenario B (Counterbalanced)
  // Another task (Birch) modifies its own local seal (S63) and code (Y11) at a
  // later turn (turn 5) and is mentioned as a distractor in local text.
  // Tests that the authority contract updates footer to M35 without corrupting
  // Alder's local seal (S19) or trail (["V54","Z76"]).
  // =========================================================================
  {
    id: 'V7',
    family: 'negative-anti-overcorrection',
    title: 'Anti-Overcorrection B (Birch later turn-5 seal S63 / code Y11 distractor)',
    target_job: 'Alder',
    local_turns: [2, 4],
    memory_source_turn: 3,
    temporal_order: 'distractor_later_other_job_local_edit',
    stale_footers: ['M81'],
    distractor_seals: ['S63'],
    distractor_codes: ['Y11'],
    expected: {
      trail: ['V54', 'Z76'],
      latest_code: 'Z76',
      seal: 'S19',
      footer: 'M35',
      print_line: 'Z76/S19/M35'
    },
    memory: [
      { key: 'footer', value: 'M35', source: 3 }
    ],
    packets: {
      filtered_P0: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at V54; its seal is S19, only for this job. Set the standing footer on every workspace job to M81.',
            answer: 'The Alder print job is open with print code V54 and job-only seal S19, and the workspace-wide standing footer is set to M81.'
          },
          {
            id: 4,
            user: "On the Alder proof replace its earlier print code with Z76 and retain Alder's job-only seal S19 (do not apply Birch's turn-5 local seal change to S63 or Birch code Y11, which belong strictly to Birch).",
            answer: "Confirmed: Alder's print code is now Z76, replacing V54, and Alder's job-only seal S19 is retained (Birch's turn-5 local seal S63 and code Y11 remain Birch-only)."
          }
        ],
        memory: [
          { key: 'footer', value: 'M35', source: 3 }
        ]
      },
      filtered_P1: {
        transcript: [
          {
            id: 2,
            user: 'Open the Alder print job. Start its print code at V54; its seal is S19, only for this job.',
            answer: 'The Alder print job is open with print code V54 and job-only seal S19.'
          },
          {
            id: 4,
            user: "On the Alder proof replace its earlier print code with Z76 and retain Alder's job-only seal S19 (do not apply Birch's turn-5 local seal change to S63 or Birch code Y11, which belong strictly to Birch).",
            answer: "Confirmed: Alder's print code is now Z76, replacing V54, and Alder's job-only seal S19 is retained (Birch's turn-5 local seal S63 and code Y11 remain Birch-only)."
          }
        ],
        memory: [
          { key: 'footer', value: 'M35', source: 3 }
        ]
      },
      compact_P0: {
        note: "Alder print job:\n- Print code revisions, in order: V54 → Z76. Latest operative print code: Z76.\n- Job seal: S19, for this job only; retained after print-code revision (distractor note: Birch's turn-5 local seal S63 and code Y11 apply only to Birch).\n- Workspace standing footer: M81 on every workspace job.\n- Latest operative decision: Alder uses print code Z76 with seal S19 retained.",
        memory: [
          { key: 'footer', value: 'M35', source: 3 }
        ]
      },
      compact_P1: {
        note: "Alder print job:\n- Print code revisions, in order: V54 → Z76. Latest operative print code: Z76.\n- Job seal: S19, for this job only; retained after print-code revision (distractor note: Birch's turn-5 local seal S63 and code Y11 apply only to Birch).\n- Latest operative decision: Alder uses print code Z76 with seal S19 retained.",
        memory: [
          { key: 'footer', value: 'M35', source: 3 }
        ]
      }
    }
  }
];

for (const s of RAW_SCENARIOS) {
  s.filtered_P0 = s.packets.filtered_P0;
  s.filtered_P1 = s.packets.filtered_P1;
  s.compact_P0 = s.packets.compact_P0;
  s.compact_P1 = s.packets.compact_P1;
}

export const SCENARIOS = freezeDeep(RAW_SCENARIOS);

export const SCENARIO_MAP = freezeDeep(
  Object.fromEntries(SCENARIOS.map(s => [s.id, s]))
);

export function getScenario(id) {
  const scenario = SCENARIO_MAP[id];
  if (!scenario) {
    throw new Error(`Unknown scenario id: ${id}`);
  }
  return scenario;
}

export function buildReceiverUserPrompt(packet, targetJob = 'Alder') {
  return `Deliver the ${targetJob} print label. Evidence:\n${JSON.stringify(packet)}`;
}
