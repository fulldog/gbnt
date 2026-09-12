import type { MiniappRegionsResult, OrgTreeNode } from "@gbnt/api-client";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import type { MiniappAuthUser } from "@/api/types";
import { useRegions } from "@/composables/report/useRegions";

function node(id: number, parentId: number, name: string, type: OrgTreeNode["type"], children: OrgTreeNode[] = []): OrgTreeNode {
  return { id, parent_id: parentId, name, type, sort: id, children };
}

const fullTree = [node(1, 0, "根", "root", [
  node(2, 1, "区", "district", [
    node(3, 2, "甲街道", "street", [node(4, 3, "甲村", "village"), node(5, 3, "乙村", "village")]),
    node(6, 2, "乙街道", "street", [node(7, 6, "丙村", "village")]),
  ]),
])];

function user(id: number, orgId: number): MiniappAuthUser {
  return {
    id,
    username: `user-${id}`,
    name: "",
    phone: "",
    org_id: orgId,
    role_id: 2,
    is_super_admin: false,
    apis: [],
    org_name: null,
    org_path: null,
    role_name: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("上报组织范围", () => {
  it("村账号只保留本村，街道账号只保留本街道下级", async () => {
    let account = user(10, 4);
    const regions = useRegions(() => account, async () => ({ list: fullTree }));
    await regions.load();
    expect(regions.options.value).toEqual([{ id: 4, label: "根 / 区 / 甲街道 / 甲村" }]);

    account = user(11, 3);
    await regions.load();
    expect(regions.options.value).toEqual([
      { id: 4, label: "根 / 区 / 甲街道 / 甲村" },
      { id: 5, label: "根 / 区 / 甲街道 / 乙村" },
    ]);
    expect(regions.options.value.some((item) => item.id === 7)).toBe(false);
  });

  it("切换账号时丢弃旧请求，不能让上一账号的组织树回显", async () => {
    let account = user(10, 4);
    const first = deferred<MiniappRegionsResult>();
    const second = deferred<MiniappRegionsResult>();
    let calls = 0;
    const regions = useRegions(() => account, () => (++calls === 1 ? first.promise : second.promise));

    const firstLoad = regions.load();
    account = user(11, 7);
    const secondLoad = regions.load();
    second.resolve({ list: fullTree });
    await secondLoad;
    first.resolve({ list: fullTree });
    await firstLoad;
    await nextTick();

    expect(calls).toBe(2);
    expect(regions.loading.value).toBe(false);
    expect(regions.options.value).toEqual([{ id: 7, label: "根 / 区 / 乙街道 / 丙村" }]);
  });
});
