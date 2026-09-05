import type { QuizType } from "@gbnt/api-client";

export interface RectifyDraftSubmitItem {
  type: QuizType;
  note: string;
  photoPaths: string[];
}
