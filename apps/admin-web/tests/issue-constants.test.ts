import { ISSUE_STATUSES, ISSUE_TYPES, PROJECT_YEARS } from "@gbnt/api-client";
import { describe, expect, it } from "vitest";
import {
  ISSUE_STATUS_META,
  QUIZ_DEFINITIONS,
  quizIndicatesIssue,
  quizLabel,
} from "@/constants/issue";

describe("后端问题枚举映射", () => {
  it("只展示后端当前三种状态和四个年度", () => {
    expect(ISSUE_STATUSES).toEqual(["new", "pending", "done"]);
    expect(PROJECT_YEARS).toEqual([2020, 2021, 2022, 2023]);
    expect(ISSUE_STATUS_META).toEqual({
      new: { label: "待整改", tag: "danger" },
      pending: { label: "整改中", tag: "warning" },
      done: { label: "已整改", tag: "success" },
    });
  });

  it("为五类问题提供与后端一致的题目集合", () => {
    expect(Object.keys(QUIZ_DEFINITIONS)).toEqual([...ISSUE_TYPES]);
    expect(QUIZ_DEFINITIONS.well.map((item) => item.type)).toEqual([
      "water_out",
      "pipe_ok",
      "wiring_ok",
      "box_ok",
      "cover_ok",
      "transformer_ok",
    ]);
    expect(QUIZ_DEFINITIONS.road.map((item) => item.type)).toEqual([
      "has_shoulder",
      "has_ash",
    ]);
  });

  it("区分正向题与反向题的问题判定", () => {
    expect(quizIndicatesIssue(false, false)).toBe(true);
    expect(quizIndicatesIssue(true, false)).toBe(false);
    expect(quizIndicatesIssue(true, true)).toBe(true);
    expect(quizIndicatesIssue(false, true)).toBe(false);
    expect(quizLabel("illegal_wire")).toBe("是否私拉乱接");
  });
});
