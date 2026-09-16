import { expect, test } from '@playwright/test';

/**
 * The core happy path from the plan. Extended as features land:
 * register → create account → add transactions → see them → dashboard reflects them.
 * (Import review, analytics and AI steps join once those phases ship.)
 */
test('a new user records their first finances and sees them reflected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Priya Test');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a very long password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Start by adding an account')).toBeVisible();

  await page.goto('/accounts');
  await page.getByRole('button', { name: 'New account' }).first().click();
  const accountDialog = page.getByRole('dialog', { name: 'New account' });
  await accountDialog.getByLabel('Name').fill('Axis Salary');
  await accountDialog.getByLabel('Opening balance').fill('10000');
  await accountDialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Axis Salary')).toBeVisible();

  await page.getByRole('link', { name: 'Axis Salary' }).click();
  await expect(page.getByRole('heading', { name: 'Axis Salary' })).toBeVisible();

  const addTransaction = async (description: string, type: string, amount: string) => {
    await page.getByRole('button', { name: 'Add transaction' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add transaction' });
    await dialog.getByLabel('Description').fill(description);
    await dialog.getByLabel('Type').click();
    // antd renders a hidden a11y listbox alongside the visible one; click the visible item.
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: new RegExp(`^${type}$`) }).click();
    await dialog.getByLabel('Amount').fill(amount);
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: new RegExp(description) })).toBeVisible();
  };
  await addTransaction('Monthly salary', 'Income', '50000');
  await addTransaction('Groceries run', 'Expense', '1250.50');

  // Balance = 10000 + 50000 − 1250.50, computed by the API.
  await expect(page.getByText('₹58,749.50').first()).toBeVisible();

  await page.goto('/dashboard');
  // Income, expenses and net cashflow come from the analytics API.
  await expect(page.getByText('₹50,000.00').first()).toBeVisible();
  await expect(page.getByText('₹1,250.50').first()).toBeVisible();
  await expect(page.getByText('₹48,749.50')).toBeVisible();

  await page.goto('/transactions?search=groceries');
  await expect(page.getByRole('cell', { name: /Groceries run/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Monthly salary/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});
