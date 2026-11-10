# Phase 0.9.1 candidate retrieval

Compare top-1/3/8 against the provisional referenced Task, separately from
wrong Task selection by any offline mode. A closed or intentionally missing
candidate is included in the retrieval reference denominator but is not
eligible for an actionable route. Mixed recency, exact Session incarnation,
literal references, lexical overlap and scope denial are tested.

The delivered measurements include per-case rankings and a bounded-query
scale sweep at 128, 512 and 2,048 indexed Tasks. Index update/build cost is
not included in warmed lookup latency. Query visits are reported so latency
does not conceal a full-catalog scan. The test corpus is not a production
distribution and a high top-k rate does not authorize Binding.
