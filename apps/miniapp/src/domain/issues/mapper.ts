import type {
  BridgeQuizType,
  ForestQuizType,
  MiniappCreateIssueInput,
  QuizBool,
  QuizType,
  RoadQuizType,
  TransformerQuizType,
  WellQuizType,
} from "@gbnt/api-client";
import { QUIZ_DEFINITIONS, quizIndicatesIssue } from "./definitions";
import type { QuizFormItem, ReportFormState } from "./form";

function numeric(value: string): number {
  return Number(value.trim());
}

function checklist<TType extends QuizType>(form: ReportFormState): QuizBool<TType>[] {
  const definitions = QUIZ_DEFINITIONS[form.type];
  return definitions.map((definition) => {
    const item = form.quizzes.find((candidate) => candidate.type === definition.type);
    if (!item || item.value === null) {
      throw new Error(`排查项 ${definition.type} 尚未填写`);
    }
    const indicatesIssue = quizIndicatesIssue(definition, item.value);
    return {
      type: definition.type,
      value: item.value,
      desc: item.desc.trim(),
      mustImg: indicatesIssue || definition.type === "water_out",
      files: item.photos.map((photo) => photo.fileId),
    } as QuizBool<TType>;
  });
}

function common(form: ReportFormState) {
  return {
    project_year: form.projectYear,
    org_id: form.orgId ?? 0,
    code: form.code.trim() || undefined,
    address: form.address.trim(),
    lat: form.lat ?? undefined,
    lng: form.lng ?? undefined,
    plan_date: form.planDate || undefined,
    reporter_signature_file_id: form.signatureFileId,
  };
}

export function buildCreateIssueInput(form: ReportFormState): MiniappCreateIssueInput {
  const base = common(form);
  const keeper_name = form.details.keeperName.trim();
  const keeper_phone = form.details.keeperPhone.trim();

  switch (form.type) {
    case "well":
      return {
        ...base,
        type: "well",
        type_ext: {
          build_kind: form.details.buildKind,
          outlet_total: numeric(form.details.outletTotal),
          outlet_damaged: numeric(form.details.outletDamaged),
          casing_total: numeric(form.details.casingTotal),
          casing_damaged: numeric(form.details.casingDamaged),
          keeper_name,
          keeper_phone,
          checklist: checklist<WellQuizType>(form),
        },
      };
    case "road":
      return {
        ...base,
        type: "road",
        type_ext: {
          length: numeric(form.details.length),
          width: numeric(form.details.width),
          thickness: numeric(form.details.thickness),
          tree_survive: numeric(form.details.treeSurvive),
          keeper_name,
          keeper_phone,
          checklist: checklist<RoadQuizType>(form),
        },
      };
    case "bridge":
      return {
        ...base,
        type: "bridge",
        type_ext: {
          kind: form.details.bridgeKind,
          length: numeric(form.details.length),
          width: numeric(form.details.width),
          keeper_name,
          keeper_phone,
          checklist: checklist<BridgeQuizType>(form),
        },
      };
    case "forest":
      return {
        ...base,
        type: "forest",
        type_ext: {
          handover_count: numeric(form.details.handoverCount),
          existing_count: numeric(form.details.existingCount),
          survive_rate: numeric(form.details.surviveRate),
          keeper_name,
          keeper_phone,
          checklist: checklist<ForestQuizType>(form),
        },
      };
    case "transformer":
      return {
        ...base,
        type: "transformer",
        type_ext: {
          capacity: numeric(form.details.capacity),
          model: form.details.transformerModel.trim(),
          voltage: form.details.voltage,
          keeper_name,
          keeper_phone,
          checklist: checklist<TransformerQuizType>(form),
        },
      };
  }
}

export function findQuiz(form: ReportFormState, type: string): QuizFormItem | undefined {
  return form.quizzes.find((item) => item.type === type);
}
