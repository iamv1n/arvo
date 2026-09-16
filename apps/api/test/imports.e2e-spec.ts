import type { INestApplication } from '@nestjs/common';
import { createTestApp, registerUser } from './app';

const STATEMENT = `HDFC BANK Ltd.
Statement of account

Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/08/26,SALARY ACME TECHNOLOGIES,REF1,,"1,45,000.00","1,95,000.00"
03/08/26,NEFT RENT MR SHARMA,REF2,"32,000.00",,"1,63,000.00"
14/08/26,UPI-SWIGGY-8812,REF3,649.50,,"1,62,350.50"
14/08/26,UPI-SWIGGY-8812,REF3,649.50,,"1,61,701.00"
31/02/26,BROKEN ROW,REF4,10.00,,
`;

describe('Statement imports (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => app.close());

  it('uploads a CSV, maps, reviews, commits and remembers the mapping', async () => {
    const user = await registerUser(app);
    const account = (await user.post('/accounts', { name: 'HDFC', type: 'BANK' }).expect(201)).body;

    const uploaded = await user.upload('/imports', { accountId: account.id }, { name: 'hdfc.csv', content: STATEMENT }).expect(201);
    expect(uploaded.body).toMatchObject({ status: 'PENDING', fileType: 'CSV', filename: 'hdfc.csv' });
    expect(uploaded.body).not.toHaveProperty('storageKey');
    const detection = uploaded.body.detection;
    expect(detection.mappingSource).toBe('AUTO');
    expect(detection.tables[0].headers.slice(0, 2)).toEqual(['Date', 'Narration']);
    const batchId = uploaded.body.id;

    const processed = await user.post(`/imports/${batchId}/process`, { mapping: detection.suggestedMapping }).expect(200);
    expect(processed.body.counts).toMatchObject({
      total: 5,
      byStatus: { VALID: 3, POSSIBLE_DUPLICATE: 1, INVALID: 1, AMBIGUOUS: 0 },
      byDecision: { ACCEPT: 3, PENDING: 1, REJECT: 1 },
    });
    expect((await user.get('/transactions')).body.total).toBe(0);

    const rows = (await user.get(`/imports/${batchId}/rows?limit=10`).expect(200)).body.items;
    expect(rows.map((r: { amount: string | null }) => r.amount)).toEqual(['145000.00', '-32000.00', '-649.50', '-649.50', '-10.00']);
    expect(rows[4].issues[0].code).toBe('INVALID_DATE');

    const blocked = await user.post(`/imports/${batchId}/commit`).expect(409);
    expect(blocked.body.error.code).toBe('IMPORT_HAS_PENDING_ROWS');

    // Fix the broken row's date, accept it, reject the duplicate.
    const fixed = await user.patch(`/imports/${batchId}/rows/${rows[4].id}`, { date: '2026-08-28' }).expect(200);
    expect(fixed.body).toMatchObject({ status: 'VALID', decision: 'ACCEPT' });
    await user.post(`/imports/${batchId}/decisions`, { decision: 'REJECT', statuses: ['POSSIBLE_DUPLICATE'] }).expect(200);
    const invalidAccept = await user.post(`/imports/${batchId}/decisions`, { decision: 'ACCEPT', statuses: ['INVALID'] }).expect(422);
    expect(invalidAccept.body.error.code).toBe('IMPORT_ROW_INVALID');

    const committed = await user.post(`/imports/${batchId}/commit`).expect(200);
    expect(committed.body.batch).toMatchObject({ status: 'COMPLETED', processedRows: 4 });
    const ledger = await user.get('/transactions').expect(200);
    expect(ledger.body.total).toBe(4);
    expect(ledger.body.items.every((t: { source: string }) => t.source === 'CSV')).toBe(true);
    expect((await user.get(`/accounts/${account.id}`)).body.balance).toBe('112340.50');

    // Same file again: warned, and every row is flagged as a possible duplicate.
    const again = await user.upload('/imports', { accountId: account.id }, { name: 'hdfc.csv', content: STATEMENT }).expect(201);
    expect(again.body.duplicateOfBatchId).toBe(batchId);
    expect(again.body.detection.mappingSource).toBe('REMEMBERED');
    const reprocessed = await user.post(`/imports/${again.body.id}/process`, { mapping: again.body.detection.suggestedMapping }).expect(200);
    expect(reprocessed.body.counts.byStatus.POSSIBLE_DUPLICATE).toBe(4);

    const file = await user.get(`/imports/${batchId}/file`).expect(200);
    expect(file.headers['content-type']).toMatch(/text\/csv/);
    expect(file.headers['content-disposition']).toContain('hdfc.csv');

    await user.delete(`/imports/${batchId}`).expect(204);
    await user.get(`/imports/${batchId}`).expect(404);
    expect((await user.get('/transactions')).body.total).toBe(4);
  });

  it('rejects unsupported and oversized files and isolates imports per user', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const account = (await a.post('/accounts', { name: 'HDFC', type: 'BANK' })).body;

    const exe = await a.upload('/imports', { accountId: account.id }, { name: 'statement.csv', content: Buffer.from([0x4d, 0x5a, 0, 0, 1, 2]) }).expect(422);
    expect(exe.body.error.code).toBe('IMPORT_UNSUPPORTED_FILE');
    await a.post('/imports', {}).expect(400);

    const big = await a.upload('/imports', { accountId: account.id }, { name: 'big.csv', content: Buffer.alloc(10 * 1024 * 1024 + 1, 'a') });
    expect(big.status).toBe(413);

    const batch = (await a.upload('/imports', { accountId: account.id }, { name: 'hdfc.csv', content: STATEMENT }).expect(201)).body;
    await b.upload('/imports', { accountId: account.id }, { name: 'hdfc.csv', content: STATEMENT }).expect(404);
    await b.get(`/imports/${batch.id}`).expect(404);
    await b.get(`/imports/${batch.id}/rows`).expect(404);
    await b.get(`/imports/${batch.id}/file`).expect(404);
    await b.post(`/imports/${batch.id}/process`, { mapping: batch.detection.suggestedMapping }).expect(404);
    await b.delete(`/imports/${batch.id}`).expect(404);
    expect((await b.get('/imports')).body).toMatchObject({ items: [], total: 0 });
  });

  it('applies user rules during import', async () => {
    const user = await registerUser(app);
    const account = (await user.post('/accounts', { name: 'HDFC', type: 'BANK' })).body;
    const categories = (await user.get('/categories')).body.items as { id: string; name: string }[];
    const delivery = categories.find((c) => c.name === 'Delivery')!;
    await user
      .post('/rules', { name: 'Swiggy', conditions: [{ field: 'description', operator: 'contains', value: 'swiggy' }], actions: { categoryId: delivery.id, merchantName: 'Swiggy' } })
      .expect(201);

    const batch = (await user.upload('/imports', { accountId: account.id }, { name: 'hdfc.csv', content: STATEMENT })).body;
    await user.post(`/imports/${batch.id}/process`, { mapping: batch.detection.suggestedMapping }).expect(200);
    const swiggy = (await user.get(`/imports/${batch.id}/rows`)).body.items[2];
    expect(swiggy).toMatchObject({ categoryId: delivery.id, categorizationSource: 'RULE', merchantName: 'Swiggy' });
  });
});
