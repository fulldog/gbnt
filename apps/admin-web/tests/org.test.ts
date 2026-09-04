import type { SysOrg } from "@gbnt/api-client";
import { describe, expect, it } from "vitest";
import { buildOrgPathMap, buildOrgTree } from "@/utils/org";

function org(id: number, parentId: number, name: string, sort: number): SysOrg {
  return {
    id,
    parent_id: parentId,
    name,
    sort,
    type: id === 1 ? "root" : id === 2 ? "district" : id === 3 ? "street" : "village",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_id: 1,
    updated_id: 1,
    is_delete: 0,
  };
}

describe("组织展示转换", () => {
  const orgs = [
    org(4, 3, "东村", 2),
    org(1, 0, "GBNT", 1),
    org(3, 2, "建设街道", 1),
    org(2, 1, "示范区", 1),
    org(5, 3, "西村", 1),
  ];

  it("按 parent_id 建树并按 sort 排序", () => {
    const tree = buildOrgTree(orgs);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.children[0]?.children.map((item) => item.name)).toEqual([
      "西村",
      "东村",
    ]);
  });

  it("生成完整组织路径", () => {
    const paths = buildOrgPathMap(orgs);
    expect(paths.get(4)).toBe("GBNT / 示范区 / 建设街道 / 东村");
    expect(paths.get(999)).toBeUndefined();
  });
});
