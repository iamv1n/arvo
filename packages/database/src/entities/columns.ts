import { CreateDateColumn, UpdateDateColumn, type ColumnOptions } from 'typeorm';

/** numeric(19,4): read back as an exact decimal string. Matches finance-core MONEY_SCALE. */
export const MONEY_COLUMN: ColumnOptions = { type: 'numeric', precision: 19, scale: 4 };

export const CreatedAt = () => CreateDateColumn({ name: 'created_at', type: 'timestamptz' });
export const UpdatedAt = () => UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' });
