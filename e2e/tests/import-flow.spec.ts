import { expect, test } from '@playwright/test';

const STATEMENT = `HDFC BANK Ltd.
Statement of account

Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/08/26,SALARY ACME TECHNOLOGIES,REF1,,"1,45,000.00","1,95,000.00"
03/08/26,NEFT RENT MR SHARMA,REF2,"32,000.00",,"1,63,000.00"
14/08/26,UPI-SWIGGY-8812,REF3,649.50,,"1,62,350.50"
14/08/26,UPI-SWIGGY-8812,REF3,649.50,,"1,61,701.00"
31/02/26,BROKEN ROW,REF4,10.00,,
`;

test('import a bank statement: map, review duplicates, commit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/register');
  await page.getByLabel('Name').fill('Import Tester');
  await page.getByLabel('Email').fill(`import-${Date.now()}@example.com`);
  await page.getByLabel('Password').fill('a very long password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/accounts');
  await page.getByRole('button', { name: 'New account' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await dialog.getByLabel('Name').fill('HDFC Savings');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('HDFC Savings')).toBeVisible();

  await page.goto('/imports');
  await page.getByRole('button', { name: 'Import statement' }).click();
  const upload = page.getByRole('dialog', { name: 'Import a statement' });
  await upload.getByLabel('Account').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: 'HDFC Savings' }).click();
  await upload.locator('input[type=file]').setInputFiles({ name: 'hdfc-aug.csv', mimeType: 'text/csv', buffer: Buffer.from(STATEMENT) });
  await upload.getByRole('button', { name: 'Upload' }).click();

  // Mapping step, detected automatically.
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Columns were detected automatically')).toBeVisible();
  await page.getByRole('button', { name: /Review 5 rows/ }).click();

  // Review step.
  await expect(page.getByText('possible duplicates', { exact: true })).toBeVisible();
  await expect(page.getByText('1 row needs your decision before committing')).toBeVisible();
  await expect(page.getByRole('button', { name: /Commit 3 transactions/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Bulk decisions' }).click();
  await page.getByRole('menuitem', { name: 'Skip all possible duplicates' }).click();
  await expect(page.getByText('row needs your decision')).toBeHidden();

  await page.getByRole('button', { name: /Commit 3 transactions/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Commit' }).click();
  await expect(page.getByText('3 transactions added to HDFC Savings')).toBeVisible();

  await page.getByRole('button', { name: 'View account' }).click();
  // 145000 − 32000 − 649.50
  await expect(page.getByText('₹1,12,350.50').first()).toBeVisible();

  expect(errors).toEqual([]);
});
