import type {
  ApiClient,
  LedgerQuery,
  StreetLedgerResult,
  SurveyLedgerResult,
} from "@gbnt/api-client";

export function createLedgerApi(client: ApiClient) {
  return {
    getStreet(query: LedgerQuery = {}): Promise<StreetLedgerResult> {
      return client.request<StreetLedgerResult>("/api/ledger/street", {
        query: { ...query },
      });
    },

    getSurvey(query: LedgerQuery = {}): Promise<SurveyLedgerResult> {
      return client.request<SurveyLedgerResult>("/api/ledger/survey", {
        query: { ...query },
      });
    },
  } as const;
}

export type LedgerApi = ReturnType<typeof createLedgerApi>;
