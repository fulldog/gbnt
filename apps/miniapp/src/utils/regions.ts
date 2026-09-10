import type { OrgTreeNode } from "@gbnt/api-client";

/** 仅处理展示名称，不改变后端区划路径或请求中的组织 ID。 */
export function formatOrganization(value: string): string {
  return value.split("/").map((part) => part.trim()).filter(Boolean).join("");
}

export function findRegion(tree: readonly OrgTreeNode[], id: number): OrgTreeNode | undefined {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findRegion(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** 保留账号组织的祖先路径和下级，排除兄弟组织，供街道／村滚轮使用。 */
export function scopeRegionTree(tree: readonly OrgTreeNode[], orgId: number): OrgTreeNode[] {
  return tree.flatMap((node) => {
    if (node.id === orgId) return [node];
    const children = scopeRegionTree(node.children, orgId);
    return children.length ? [{ ...node, children }] : [];
  });
}
