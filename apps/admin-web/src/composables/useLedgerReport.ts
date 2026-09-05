import type { LedgerAppliedQuery, LedgerPart, LedgerSplitQuery } from "@/api/ledger-report-types";
import { useLatestQuery } from "@/composables/useLatestQuery";
import { normalizeLedgerQuery } from "@/utils/ledger-report-query";
import { mergeLedgerParts } from "@/utils/ledger-report-merge";

interface LedgerLoaders<B extends { row_key: string }, S extends { row_key: string }, R> {
  readQuery: () => LedgerSplitQuery;
  loadRows: (query: LedgerAppliedQuery) => Promise<LedgerPart<B>>;
  loadStatistics: (query: LedgerAppliedQuery) => Promise<LedgerPart<S>>;
  compose: (base: B, statistics: S) => R;
  errorMessage: string;
}

/** 一次提交两份完整结果；复用既有请求序号和销毁保护，不承诺跨请求数据库快照。 */
export function useLedgerReport<B extends { row_key: string }, S extends { row_key: string }, R>(
  options: LedgerLoaders<B, S, R>,
) {
  return useLatestQuery<LedgerPart<R> | null>({
    initial: () => null,
    errorMessage: options.errorMessage,
    load: async () => {
      const query = normalizeLedgerQuery({ ...options.readQuery() });
      const [base, statistics] = await Promise.all([
        options.loadRows({ ...query }), options.loadStatistics({ ...query }),
      ]);
      return mergeLedgerParts(query, base, statistics, options.compose);
    },
  });
}
