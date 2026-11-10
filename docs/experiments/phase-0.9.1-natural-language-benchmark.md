# Phase 0.9.1 natural-language benchmark

Measure independently authored provisional dialogues rather than repeated
keyword templates. The corpus includes natural Chinese, English, mixed
dialogue and difficult task boundaries. A disjoint authoring pool is reserved
for holdout; no holdout text, expected labels or case-specific scripted
answers go into evaluator development. Family/template/construction/cluster
and Task fixture disjointness plus cross-split character-trigram checks are
recorded. The checksum seal binds corpus and evaluator before final scoring;
the run receipt is exclusively created before the first reserved case.
Clean-clone verification checks the archived holdout result without rescoring
it. This is local blind protocol, not independent external custody.

Five output classes, confusion matrices, per-class precision/recall/F1,
false merge/split, wrong UUID, no-task errors and abstention are computed on
raw parsed outputs. Invalid outputs have their own column. Proposal claim
quality and Host withheld/qualified counts remain separate. There is no
probability calibration or externally validated accuracy. Exact corpus,
partitions, results and limitations are in the delivered artifacts.
