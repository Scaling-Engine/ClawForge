import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Hub users table — central user registry for the multi-tenant hub.
 * Lives in data/hub.sqlite, separate from instance clawforge.sqlite.
 */
export const hubUsers = sqliteTable('hub_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Agent assignments table — maps hub users to agent instances.
 * Each row grants a user access to one agent slug (e.g., 'noah', 'strategyES').
 */
export const agentAssignments = sqliteTable('agent_assignments', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => hubUsers.id),
  agentSlug: text('agent_slug').notNull(), // matches INSTANCE_NAME: 'noah', 'strategyES'
  agentRole: text('agent_role').notNull().default('operator'), // 'viewer' | 'operator' | 'admin'
  createdAt: integer('created_at').notNull(),
});
