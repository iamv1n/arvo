import { CategoryType } from '@arvo/types';
import { expectDomainError, setup, USER_A, USER_B } from '../__tests__/helpers';

describe('CategoryService', () => {
  it('shows system categories to everyone and user categories only to their owner', async () => {
    const { core, store } = setup();
    store.addSystemCategory('Food');
    await core.categories.create(USER_A, { name: 'Pets', type: CategoryType.EXPENSE });
    expect((await core.categories.list(USER_A)).map((c) => c.name)).toEqual(['Food', 'Pets']);
    expect((await core.categories.list(USER_B)).map((c) => c.name)).toEqual(['Food']);
  });

  it('builds a hierarchy, allowing user subcategories under system categories', async () => {
    const { core, store } = setup();
    const food = store.addSystemCategory('Food');
    store.addSystemCategory('Groceries', CategoryType.EXPENSE, food.id);
    await core.categories.create(USER_A, { name: 'Coffee', type: CategoryType.EXPENSE, parentId: food.id });
    const [root] = await core.categories.tree(USER_A);
    expect(root.name).toBe('Food');
    expect(root.children.map((c) => c.name)).toEqual(['Coffee', 'Groceries']);
  });

  it('enforces type consistency and sibling uniqueness', async () => {
    const { core, store } = setup();
    const food = store.addSystemCategory('Food');
    await expectDomainError(
      core.categories.create(USER_A, { name: 'Salary', type: CategoryType.INCOME, parentId: food.id }),
      'CATEGORY_TYPE_MISMATCH',
    );
    await expectDomainError(core.categories.create(USER_A, { name: 'food', type: CategoryType.EXPENSE }), 'CATEGORY_ALREADY_EXISTS');
  });

  it('protects system categories', async () => {
    const { core, store } = setup();
    const food = store.addSystemCategory('Food');
    await expectDomainError(core.categories.update(USER_A, food.id, { name: 'Eats' }), 'CATEGORY_IS_SYSTEM');
    await expectDomainError(core.categories.delete(USER_A, food.id), 'CATEGORY_IS_SYSTEM');
  });

  it('prevents cycles and deleting categories with children', async () => {
    const { core } = setup();
    const parent = await core.categories.create(USER_A, { name: 'Home', type: CategoryType.EXPENSE });
    const child = await core.categories.create(USER_A, { name: 'Repairs', type: CategoryType.EXPENSE, parentId: parent.id });
    await expectDomainError(core.categories.update(USER_A, parent.id, { parentId: child.id }), 'CATEGORY_CYCLE');
    await expectDomainError(core.categories.delete(USER_A, parent.id), 'CATEGORY_HAS_CHILDREN');
    await core.categories.delete(USER_A, child.id);
    await core.categories.delete(USER_A, parent.id);
    expect(await core.categories.list(USER_A)).toEqual([]);
  });

  it('hides another user’s categories', async () => {
    const { core } = setup();
    const mine = await core.categories.create(USER_A, { name: 'Pets', type: CategoryType.EXPENSE });
    await expectDomainError(
      core.categories.create(USER_B, { name: 'Dogs', type: CategoryType.EXPENSE, parentId: mine.id }),
      'CATEGORY_NOT_FOUND',
    );
    await expectDomainError(core.categories.delete(USER_B, mine.id), 'CATEGORY_NOT_FOUND');
  });
});
