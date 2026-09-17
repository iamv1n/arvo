import { AccountEntity } from './account.entity';
import { ApiTokenEntity } from './api-token.entity';
import { OAuthAuthorizationEntity, OAuthClientEntity, OAuthTokenEntity } from './oauth.entities';
import { ImportBatchEntity, ImportColumnMappingEntity, ImportErrorEntity, ImportRowEntity } from './import.entities';
import { RecurringSeriesEntity } from './recurring.entity';
import { RuleEntity } from './rule.entity';
import { CategoryEntity } from './category.entity';
import { MerchantEntity } from './merchant.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { TransactionEntity } from './transaction.entity';
import { TransferEntity } from './transfer.entity';
import { UserEntity } from './user.entity';

export {
  ApiTokenEntity,
  OAuthAuthorizationEntity,
  OAuthClientEntity,
  OAuthTokenEntity,
  RecurringSeriesEntity,
  AccountEntity,
  ImportBatchEntity,
  ImportColumnMappingEntity,
  ImportErrorEntity,
  ImportRowEntity,
  RuleEntity,
  CategoryEntity,
  MerchantEntity,
  RefreshTokenEntity,
  TransactionEntity,
  TransferEntity,
  UserEntity,
};

export const ENTITIES = [
  UserEntity,
  RefreshTokenEntity,
  AccountEntity,
  CategoryEntity,
  MerchantEntity,
  TransactionEntity,
  TransferEntity,
  ImportBatchEntity,
  ImportRowEntity,
  ImportErrorEntity,
  ImportColumnMappingEntity,
  RuleEntity,
  RecurringSeriesEntity,
  ApiTokenEntity,
  OAuthClientEntity,
  OAuthAuthorizationEntity,
  OAuthTokenEntity,
];
