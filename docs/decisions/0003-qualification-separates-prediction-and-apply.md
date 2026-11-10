# ADR 0003: Separate quality qualification from graph mutation

**Status:** Accepted for the isolated Phase 0.9.1 qualification.

Score raw intent/claims before the guard; count guard rejection separately.
Use revisioned, protected synthetic evidence to ground review inside the
same SQLite transaction. Keep explicit lifecycle operator authority separate
from graph review and from offline adapter inputs. The catalog is bounded
and local; retrieval score is not identity. Freeze a reserved split before
its first evaluation and ship human annotation work separately from
provisional labels. Do not enable a Provider transport or production context.
