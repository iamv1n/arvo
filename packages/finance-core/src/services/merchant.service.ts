import { DomainError } from '../errors';
import { normalizeMerchantName } from '../normalize';
import type { MerchantRepository } from '../ports';
import { normalizePage, type MerchantRecord, type Page, type PageRequest } from '../records';
import { requireText } from './validation';

export class MerchantService {
  constructor(private readonly store: { merchants: MerchantRepository }) {}

  async list(userId: string): Promise<MerchantRecord[]> {
    const merchants = await this.store.merchants.findAll(userId);
    return [...merchants].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }

  async page(userId: string, request: Partial<PageRequest> & { search?: string } = {}): Promise<Page<MerchantRecord>> {
    return this.store.merchants.findPage(userId, { ...normalizePage(request), search: request.search?.trim() || undefined });
  }

  async require(userId: string, id: string): Promise<MerchantRecord> {
    const merchant = await this.store.merchants.findById(userId, id);
    if (!merchant) {
      throw DomainError.notFound('MERCHANT_NOT_FOUND', 'Merchant not found');
    }
    return merchant;
  }

  async create(userId: string, rawName: string): Promise<MerchantRecord> {
    const { name, normalizedName } = parseName(rawName);
    if (await this.store.merchants.findByNormalizedName(userId, normalizedName)) {
      throw DomainError.conflict('MERCHANT_ALREADY_EXISTS', `Merchant "${name}" already exists`);
    }
    return this.store.merchants.create({ userId, name, normalizedName });
  }

  /** Returns the merchant whose normalized name matches, creating it if needed. */
  async findOrCreate(userId: string, rawName: string): Promise<MerchantRecord> {
    const { name, normalizedName } = parseName(rawName);
    const existing = await this.store.merchants.findByNormalizedName(userId, normalizedName);
    return existing ?? this.store.merchants.create({ userId, name, normalizedName });
  }

  async rename(userId: string, id: string, rawName: string): Promise<MerchantRecord> {
    await this.require(userId, id);
    const { name, normalizedName } = parseName(rawName);
    const clash = await this.store.merchants.findByNormalizedName(userId, normalizedName);
    if (clash && clash.id !== id) {
      throw DomainError.conflict('MERCHANT_ALREADY_EXISTS', `Merchant "${name}" already exists`);
    }
    return this.store.merchants.update(userId, id, { name, normalizedName });
  }

  /** Transactions keep their description; their merchant link is cleared. */
  async delete(userId: string, id: string): Promise<void> {
    await this.require(userId, id);
    await this.store.merchants.delete(userId, id);
  }
}

function parseName(rawName: string): { name: string; normalizedName: string } {
  const name = requireText('name', rawName, 120);
  const normalizedName = normalizeMerchantName(name);
  if (!normalizedName) {
    throw DomainError.validation('INVALID_INPUT', 'name must contain letters or digits', { field: 'name' });
  }
  return { name, normalizedName };
}
