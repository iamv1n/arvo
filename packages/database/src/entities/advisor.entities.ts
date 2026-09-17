import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CreatedAt, UpdatedAt } from './columns';
import { UserEntity } from './user.entity';

export type AdvisorMessageRole = 'user' | 'assistant';
export type AdvisorMessageStatus = 'complete' | 'streaming' | 'error';
export type AdvisorSuggestionKind = 'budget' | 'goal' | 'rule' | 'scenario';
export type AdvisorSuggestionStatus = 'pending' | 'approved' | 'dismissed';

@Entity('advisor_conversations')
@Index('idx_advisor_conversations_user_updated', ['userId', 'updatedAt'])
export class AdvisorConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('advisor_messages')
@Index('idx_advisor_messages_conversation_created', ['conversationId', 'createdAt'])
export class AdvisorMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => AdvisorConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AdvisorConversationEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 16 })
  role!: AdvisorMessageRole;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ type: 'varchar', length: 16, default: 'complete' })
  status!: AdvisorMessageStatus;

  /** Provenance: one record per tool call (name, input, summary, data used). */
  @Column({ name: 'tool_calls', type: 'jsonb', default: () => "'[]'" })
  toolCalls!: unknown[];

  @Column({ type: 'varchar', length: 16, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model!: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 40, nullable: true })
  errorCode!: string | null;

  @CreatedAt()
  createdAt!: Date;
}

@Entity('advisor_suggestions')
@Index('idx_advisor_suggestions_user_status', ['userId', 'status', 'createdAt'])
export class AdvisorSuggestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId!: string | null;

  @ManyToOne(() => AdvisorConversationEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: AdvisorConversationEntity;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId!: string | null;

  @ManyToOne(() => AdvisorMessageEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'message_id' })
  message?: AdvisorMessageEntity;

  @Column({ type: 'varchar', length: 16 })
  kind!: AdvisorSuggestionKind;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: AdvisorSuggestionStatus;

  /** The drafted entity as the REST API accepts it; replaced by the edited version on approval. */
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text' })
  rationale!: string;

  /** Tool calls the advisor made before drafting. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  provenance!: unknown[];

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'dismissed_at', type: 'timestamptz', nullable: true })
  dismissedAt!: Date | null;

  /** Id of the budget, goal, rule or scenario created on approval. */
  @Column({ name: 'applied_entity_id', type: 'uuid', nullable: true })
  appliedEntityId!: string | null;

  /** True when the user changed the payload before approving. */
  @Column({ type: 'boolean', default: false })
  edited!: boolean;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

@Entity('advisor_briefings')
@Unique('uq_advisor_briefings_user_week', ['userId', 'weekStart'])
export class AdvisorBriefingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'week_start', type: 'date' })
  weekStart!: string;

  @Column({ name: 'as_of', type: 'date' })
  asOf!: string;

  /** The deterministic briefing structure. */
  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  narrative!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model!: string | null;

  @Column({ name: 'emailed_at', type: 'timestamptz', nullable: true })
  emailedAt!: Date | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}
