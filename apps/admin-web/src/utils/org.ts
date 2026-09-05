import type { OrgTreeNode } from "@gbnt/api-client";
import type { OrgOption } from "@/api/types";

export function buildOrgTree(orgs: readonly OrgOption[]): OrgTreeNode[] {
  const nodes = new Map<number, OrgTreeNode>();
  for (const org of orgs) {
    nodes.set(org.id, {
      id: org.id,
      name: org.name,
      type: org.type,
      parent_id: org.parent_id,
      sort: org.sort,
      children: [],
    });
  }

  const roots: OrgTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parent_id);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: OrgTreeNode[]): void => {
    items.sort((a, b) => a.sort - b.sort || a.id - b.id);
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

export function buildOrgPathMap(orgs: readonly OrgOption[]): Map<number, string> {
  const byId = new Map(orgs.map((org) => [org.id, org]));
  const cache = new Map<number, string>();

  const resolve = (id: number, seen = new Set<number>()): string => {
    const cached = cache.get(id);
    if (cached) return cached;
    const org = byId.get(id);
    if (!org) return id ? `组织 #${id}` : "—";
    if (seen.has(id)) return org.name;
    seen.add(id);
    const parent = org.parent_id ? resolve(org.parent_id, seen) : "";
    const path = parent && !parent.startsWith("组织 #") ? `${parent} / ${org.name}` : org.name;
    cache.set(id, path);
    return path;
  };

  for (const org of orgs) resolve(org.id);
  return cache;
}

export interface OrgSelectOption {
  value: number;
  label: string;
  children?: OrgSelectOption[];
}

export function orgTreeSelectData(orgs: readonly OrgOption[]): OrgSelectOption[] {
  const transform = (nodes: readonly OrgTreeNode[]): OrgSelectOption[] =>
    nodes.map((node) => ({
      value: node.id,
      label: node.name,
      children: node.children.length ? transform(node.children) : undefined,
    }));
  return transform(buildOrgTree(orgs));
}
