import 'reflect-metadata';
import { ApiTokenEntity, createFinanceStore, databaseOptions, generateApiToken, generateOAuthTokens, OAuthClientEntity, OAuthTokenEntity, UserEntity } from '@arvo/database';
import { FinanceCore } from '@arvo/finance-core';
import { AccountType, TransactionType } from '@arvo/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { DataSource } from 'typeorm';
import { createHttpServer } from '../src/http';

/** Uses a dedicated database derived from TEST_DATABASE_URL (…_mcp) and recreates it. */
async function testDataSource(): Promise<DataSource> {
  const envFile = resolve(__dirname, '../../../.env');
  // process.loadEnvFile would write to the real process env, not Jest's sandboxed copy.
  if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) Object.assign(process.env, parseEnv(readFileSync(envFile, 'utf8')));
  const base = new URL(process.env.TEST_DATABASE_URL!);
  const database = `${base.pathname.slice(1)}_mcp`;
  if (!database.includes('test')) throw new Error('Test database name must contain "test"');
  const admin = await new DataSource({ type: 'postgres', url: Object.assign(new URL(base), { pathname: '/postgres' }).toString() }).initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.destroy();
  const dataSource = await new DataSource(databaseOptions(Object.assign(new URL(base), { pathname: `/${database}` }).toString())).initialize();
  await dataSource.runMigrations();
  return dataSource;
}

describe('MCP server over Streamable HTTP (e2e)', () => {
  let dataSource: DataSource;
  let core: FinanceCore;
  let server: ReturnType<typeof createHttpServer>;
  let endpoint: URL;

  async function userWithToken(email: string) {
    const users = dataSource.getRepository(UserEntity);
    const user = await users.save(users.create({ email, name: 'MCP User', passwordHash: 'x', currency: 'INR', timezone: 'Asia/Kolkata' }));
    const { token, prefix, hash } = generateApiToken();
    const tokens = dataSource.getRepository(ApiTokenEntity);
    const saved = await tokens.save(tokens.create({ userId: user.id, name: 'test', tokenPrefix: prefix, tokenHash: hash, scopes: ['read'], lastUsedAt: null, expiresAt: null, revokedAt: null }));
    return { user, token, tokenId: saved.id };
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'arvo-e2e', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
  }

  beforeAll(async () => {
    dataSource = await testDataSource();
    core = new FinanceCore(createFinanceStore(dataSource));
    // Bind first to learn the port, then build the server with its real resource URL.
    const probe = createHttpServer(dataSource, core, { resourceUrl: 'http://127.0.0.1/mcp', authorizationServer: 'http://auth.test' });
    await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((done) => probe.close(done));
    endpoint = new URL(`http://127.0.0.1:${port}/mcp`);
    server = createHttpServer(dataSource, core, { resourceUrl: endpoint.toString(), authorizationServer: 'http://auth.test' });
    await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  });

  afterAll(async () => {
    await new Promise((done) => server.close(done));
    await dataSource.destroy();
  });

  it('rejects requests without a valid token', async () => {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${endpoint.origin}/.well-known/oauth-protected-resource/mcp", scope="finance:read"`,
    );
    const metadata = await fetch(new URL('/.well-known/oauth-protected-resource/mcp', endpoint)).then((r) => r.json());
    expect(metadata).toEqual({
      resource: endpoint.toString(),
      authorization_servers: ['http://auth.test'],
      scopes_supported: ['finance:read'],
      bearer_methods_supported: ['header'],
      resource_name: 'Arvo personal finance',
    });
    const bad = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer arvo_pat_nope' }, body: '{}' });
    expect(bad.status).toBe(401);
    expect((await fetch(new URL('/health', endpoint))).status).toBe(200);
  });

  it('lists read-only finance tools and answers with the authenticated user’s data only', async () => {
    const alice = await userWithToken('alice@mcp.test');
    const bob = await userWithToken('bob@mcp.test');
    const bank = await core.accounts.create(alice.user.id, { name: 'HDFC', type: AccountType.BANK, currency: 'INR', openingBalance: '5000' });
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
    await core.transactions.create(alice.user.id, { accountId: bank.id, date: `${month}-01`, description: 'SALARY', amount: '90000', type: TransactionType.INCOME });
    await core.transactions.create(alice.user.id, { accountId: bank.id, date: `${month}-01`, description: 'RENT', amount: '-25000', type: TransactionType.EXPENSE });

    const client = await connect(alice.token);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'finance_get_cashflow',
        'finance_get_spending_summary',
        'finance_compare_periods',
        'finance_get_net_worth',
        'finance_get_portfolio_summary',
        'finance_get_portfolio_allocation',
        'finance_get_portfolio_returns',
        'finance_get_capital_gains',
      ]),
    );
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    // Advisor-only draft tools never reach MCP clients.
    expect(tools.some((t) => t.name.startsWith('draft_'))).toBe(false);
    expect(tools.find((t) => t.name === 'finance_get_transactions')?.inputSchema.properties).toHaveProperty('min_amount');

    const cashflow = await client.callTool({ name: 'finance_get_cashflow', arguments: {} });
    expect(cashflow.isError).toBeFalsy();
    expect(cashflow.structuredContent).toMatchObject({ income: '90000.00', expenses: '25000.00', net_cashflow: '65000.00' });

    const worth = await client.callTool({ name: 'finance_get_net_worth', arguments: {} });
    expect(worth.structuredContent).toMatchObject({ net_worth: '70000.00' });
    await client.close();

    const bobClient = await connect(bob.token);
    const bobCashflow = await bobClient.callTool({ name: 'finance_get_cashflow', arguments: {} });
    expect(bobCashflow.structuredContent).toMatchObject({ income: '0.00', expenses: '0.00' });
    const probe = await bobClient.callTool({ name: 'finance_get_account_balance', arguments: { account_id: bank.id } });
    expect(probe.isError).toBe(true);
    expect(JSON.stringify(probe.content)).toContain('ACCOUNT_NOT_FOUND');
    await bobClient.close();
  });

  it('accepts OAuth access tokens only when issued for this server', async () => {
    const dana = await userWithToken('dana@mcp.test');
    await dataSource.getRepository(OAuthClientEntity).save({ clientId: 'client-1', clientName: 'Test', redirectUris: ['https://c.test/cb'], clientUri: null, logoUri: null, registrationType: 'DCR', fetchedAt: null });
    const issue = async (resource: string) => {
      const t = generateOAuthTokens();
      await dataSource.getRepository(OAuthTokenEntity).save({
        userId: dana.user.id, clientId: 'client-1', scope: 'finance:read', resource,
        accessTokenHash: t.accessHash, accessExpiresAt: new Date(Date.now() + 60_000),
        refreshTokenHash: t.refreshHash, refreshExpiresAt: new Date(Date.now() + 60_000), lastUsedAt: null, revokedAt: null,
      });
      return t.accessToken;
    };
    const good = await connect(await issue(endpoint.toString()));
    expect((await good.callTool({ name: 'finance_get_accounts', arguments: {} })).isError).toBeFalsy();
    await good.close();

    const otherAudience = await issue('https://someone-else.example.com/mcp');
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${otherAudience}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('reports invalid tool input as a tool error and stops working after revocation', async () => {
    const carol = await userWithToken('carol@mcp.test');
    const client = await connect(carol.token);
    const invalid = await client.callTool({ name: 'finance_get_transactions', arguments: { limit: 5000 } });
    expect(invalid.isError).toBe(true);
    await client.close();

    await dataSource.getRepository(ApiTokenEntity).update({ id: carol.tokenId }, { revokedAt: new Date() });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${carol.token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
  });
});
