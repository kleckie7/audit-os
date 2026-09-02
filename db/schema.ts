import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  // bigint,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here. See docs/Database.md for schema examples and patterns.
//
// Example:
// export const posts = mysqlTable("posts", {
//   id: serial("id").primaryKey(),
//   title: varchar("title", { length: 255 }).notNull(),
//   content: text("content"),
//   createdAt: timestamp("created_at").notNull().defaultNow(),
// });
//
// Note: FK columns referencing a serial() PK must use:
//   bigint("columnName", { mode: "number", unsigned: true }).notNull()

// ─── AuditOS app tables ────────────────────────────────────────────────
import { bigint, boolean, json, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const engagements = mysqlTable(
  "engagements",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    clientName: varchar("clientName", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    auditor: varchar("auditor", { length: 255 }),
    frameworks: json("frameworks").$type<string[]>().notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({ userIdx: index("engagements_user_idx").on(t.userId) }),
);

export const answers = mysqlTable(
  "answers",
  {
    id: serial("id").primaryKey(),
    engagementId: bigint("engagementId", { mode: "number", unsigned: true }).notNull(),
    questionId: varchar("questionId", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    notes: text("notes"),
    evidenceChecked: json("evidenceChecked").$type<string[]>().notNull(),
    flagged: boolean("flagged").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({ uniq: uniqueIndex("answers_eng_q_uniq").on(t.engagementId, t.questionId) }),
);

export const findingOverrides = mysqlTable(
  "finding_overrides",
  {
    id: serial("id").primaryKey(),
    engagementId: bigint("engagementId", { mode: "number", unsigned: true }).notNull(),
    findingKey: varchar("findingKey", { length: 160 }).notNull(),
    owner: varchar("owner", { length: 255 }),
    dueDate: varchar("dueDate", { length: 32 }),
    status: varchar("status", { length: 32 }),
    response: text("response"),
    inReport: boolean("inReport").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => ({ uniq: uniqueIndex("fo_eng_key_uniq").on(t.engagementId, t.findingKey) }),
);

export type Engagement = typeof engagements.$inferSelect;
export type InsertEngagement = typeof engagements.$inferInsert;
export type AnswerRow = typeof answers.$inferSelect;
export type FindingOverrideRow = typeof findingOverrides.$inferSelect;
