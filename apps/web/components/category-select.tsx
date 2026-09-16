'use client';

import { TreeSelect } from 'antd';
import { useMemo } from 'react';
import { useCategories } from '../lib/queries';
import type { Category } from '../lib/types';

interface Node {
  value: string;
  title: string;
  children: Node[];
}

export function buildCategoryTree(categories: Category[]): Node[] {
  const nodes = new Map<string, Node>(categories.map((c) => [c.id, { value: c.id, title: c.name, children: [] }]));
  const roots: Node[] = [];
  for (const c of categories) {
    const node = nodes.get(c.id)!;
    const parent = c.parentId ? nodes.get(c.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

export function CategorySelect({
  value,
  onChange,
  placeholder = 'Category',
  allowClear = true,
  style,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  style?: React.CSSProperties;
}) {
  const { data = [], isPending } = useCategories();
  const tree = useMemo(() => buildCategoryTree(data), [data]);
  return (
    <TreeSelect
      value={value ?? undefined}
      onChange={(v) => onChange?.((v as string | undefined) ?? null)}
      treeData={tree}
      placeholder={placeholder}
      allowClear={allowClear}
      showSearch={{ treeNodeFilterProp: 'title' }}
      loading={isPending}
      style={{ minWidth: 200, ...style }}
      popupMatchSelectWidth={false}
    />
  );
}
