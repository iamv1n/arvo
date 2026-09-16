import type { CategoryType } from '@arvo/types';
import { DomainError } from '../errors';
import type { FinanceStore } from '../ports';
import type { CategoryPatch, CategoryRecord } from '../records';
import { requireText } from './validation';

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
}

export interface CategoryNode extends CategoryRecord {
  children: CategoryNode[];
}

export class CategoryService {
  constructor(private readonly store: FinanceStore) {}

  async list(userId: string): Promise<CategoryRecord[]> {
    const categories = await this.store.categories.findVisible(userId);
    return [...categories].sort(byName);
  }

  async tree(userId: string): Promise<CategoryNode[]> {
    const categories = await this.list(userId);
    const nodes = new Map<string, CategoryNode>(
      categories.map((category) => [category.id, { ...category, children: [] }]),
    );
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  async require(userId: string, id: string): Promise<CategoryRecord> {
    const category = await this.store.categories.findVisibleById(userId, id);
    if (!category) {
      throw DomainError.notFound('CATEGORY_NOT_FOUND', 'Category not found');
    }
    return category;
  }

  async create(userId: string, input: CreateCategoryInput): Promise<CategoryRecord> {
    const name = requireText('name', input.name, 80);
    const parentId = input.parentId ?? null;
    const all = await this.store.categories.findVisible(userId);
    if (parentId) {
      const parent = await this.require(userId, parentId);
      if (parent.type !== input.type) {
        throw DomainError.validation('CATEGORY_TYPE_MISMATCH', 'A subcategory must have the same type as its parent');
      }
    }
    assertUniqueSibling(all, name, parentId);
    return this.store.categories.create({
      userId,
      name,
      parentId,
      type: input.type,
      isSystem: false,
    });
  }

  async update(userId: string, id: string, input: UpdateCategoryInput): Promise<CategoryRecord> {
    const category = await this.requireEditable(userId, id);
    const all = await this.store.categories.findVisible(userId);
    const patch: CategoryPatch = {};
    const name = input.name !== undefined ? requireText('name', input.name, 80) : category.name;
    const parentId = input.parentId !== undefined ? input.parentId : category.parentId;

    if (parentId !== category.parentId && parentId !== null) {
      const parent = await this.require(userId, parentId);
      if (parent.type !== category.type) {
        throw DomainError.validation('CATEGORY_TYPE_MISMATCH', 'A subcategory must have the same type as its parent');
      }
      if (createsCycle(all, id, parentId)) {
        throw DomainError.validation('CATEGORY_CYCLE', 'A category cannot be moved under itself or its descendants');
      }
    }
    if (name.toLowerCase() !== category.name.toLowerCase() || parentId !== category.parentId) {
      assertUniqueSibling(all.filter((c) => c.id !== id), name, parentId);
    }
    if (input.name !== undefined) patch.name = name;
    if (input.parentId !== undefined) patch.parentId = parentId;
    return this.store.categories.update(userId, id, patch);
  }

  /** Transactions in a deleted category become uncategorized. */
  async delete(userId: string, id: string): Promise<void> {
    await this.requireEditable(userId, id);
    const all = await this.store.categories.findVisible(userId);
    if (all.some((c) => c.parentId === id)) {
      throw DomainError.conflict('CATEGORY_HAS_CHILDREN', 'Delete or move subcategories first');
    }
    await this.store.categories.delete(userId, id);
  }

  private async requireEditable(userId: string, id: string): Promise<CategoryRecord> {
    const category = await this.require(userId, id);
    if (category.isSystem || category.userId !== userId) {
      throw DomainError.forbidden('CATEGORY_IS_SYSTEM', 'System categories cannot be modified');
    }
    return category;
  }
}

function byName(a: CategoryRecord, b: CategoryRecord): number {
  return a.name.localeCompare(b.name, 'en');
}

function assertUniqueSibling(all: CategoryRecord[], name: string, parentId: string | null): void {
  const lower = name.toLowerCase();
  if (all.some((c) => c.parentId === parentId && c.name.toLowerCase() === lower)) {
    throw DomainError.conflict('CATEGORY_ALREADY_EXISTS', `Category "${name}" already exists here`);
  }
}

function createsCycle(all: CategoryRecord[], id: string, newParentId: string): boolean {
  const parents = new Map(all.map((c) => [c.id, c.parentId]));
  let current: string | null = newParentId;
  while (current) {
    if (current === id) return true;
    current = parents.get(current) ?? null;
  }
  return false;
}
