import { getDb } from "./connection";
import { answers, engagements, findingOverrides } from "@db/schema";
import { and, eq } from "drizzle-orm";

export async function listEngagementsByUser(userId: number) {
  return getDb().query.engagements.findMany({
    where: eq(engagements.userId, userId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
}

export async function createEngagement(data: {
  userId: number;
  clientName: string;
  name: string;
  auditor?: string;
  frameworks: string[];
}) {
  const [{ id }] = await getDb().insert(engagements).values(data).$returningId();
  return getDb().query.engagements.findFirst({ where: eq(engagements.id, id) });
}

export async function getEngagementForUser(id: number, userId: number) {
  return getDb().query.engagements.findFirst({
    where: and(eq(engagements.id, id), eq(engagements.userId, userId)),
  });
}

export async function getAnswers(engagementId: number) {
  return getDb().query.answers.findMany({
    where: eq(answers.engagementId, engagementId),
  });
}

export async function upsertAnswer(row: {
  engagementId: number;
  questionId: string;
  status: string;
  notes: string;
  evidenceChecked: string[];
  flagged: boolean;
}) {
  await getDb()
    .insert(answers)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        status: row.status,
        notes: row.notes,
        evidenceChecked: row.evidenceChecked,
        flagged: row.flagged,
        updatedAt: new Date(),
      },
    });
}

export async function deleteAnswer(engagementId: number, questionId: string) {
  await getDb()
    .delete(answers)
    .where(and(eq(answers.engagementId, engagementId), eq(answers.questionId, questionId)));
}

export async function getFindingOverrides(engagementId: number) {
  return getDb().query.findingOverrides.findMany({
    where: eq(findingOverrides.engagementId, engagementId),
  });
}

export async function upsertFindingOverride(row: {
  engagementId: number;
  findingKey: string;
  owner: string | null;
  dueDate: string | null;
  status: string | null;
  response: string | null;
  inReport: boolean;
}) {
  await getDb()
    .insert(findingOverrides)
    .values(row)
    .onDuplicateKeyUpdate({
      set: {
        owner: row.owner,
        dueDate: row.dueDate,
        status: row.status,
        response: row.response,
        inReport: row.inReport,
        updatedAt: new Date(),
      },
    });
}
