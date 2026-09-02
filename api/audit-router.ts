import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import {
  createEngagement,
  deleteAnswer,
  getAnswers,
  getEngagementForUser,
  getFindingOverrides,
  listEngagementsByUser,
  upsertAnswer,
  upsertFindingOverride,
} from "./queries/audit";

const answerInput = z.object({
  engagementId: z.number(),
  questionId: z.string().min(1).max(128),
  status: z.enum(["compliant", "partial", "noncompliant", "na"]),
  notes: z.string().max(20000).default(""),
  evidenceChecked: z.array(z.string()).default([]),
  flagged: z.boolean().default(false),
});

async function assertOwnership(engagementId: number, userId: number) {
  const eng = await getEngagementForUser(engagementId, userId);
  if (!eng) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
  return eng;
}

export const auditRouter = createRouter({
  listEngagements: authedQuery.query(({ ctx }) => listEngagementsByUser(ctx.user.id)),

  createEngagement: authedQuery
    .input(
      z.object({
        clientName: z.string().min(1).max(255),
        name: z.string().min(1).max(255),
        auditor: z.string().max(255).optional(),
        frameworks: z.array(z.string()).min(1),
      }),
    )
    .mutation(({ ctx, input }) => createEngagement({ ...input, userId: ctx.user.id })),

  getEngagement: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const engagement = await assertOwnership(input.id, ctx.user.id);
      const [answerRows, overrideRows] = await Promise.all([
        getAnswers(input.id),
        getFindingOverrides(input.id),
      ]);
      return { engagement, answers: answerRows, findingOverrides: overrideRows };
    }),

  saveAnswer: authedQuery.input(answerInput).mutation(async ({ ctx, input }) => {
    await assertOwnership(input.engagementId, ctx.user.id);
    await upsertAnswer(input);
  }),

  clearAnswer: authedQuery
    .input(z.object({ engagementId: z.number(), questionId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(input.engagementId, ctx.user.id);
      await deleteAnswer(input.engagementId, input.questionId);
    }),

  /** Bulk sync — used to upload a local (localStorage) engagement to the cloud. */
  syncAnswers: authedQuery
    .input(z.object({ engagementId: z.number(), answers: z.array(answerInput.omit({ engagementId: true })).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(input.engagementId, ctx.user.id);
      for (const a of input.answers) {
        await upsertAnswer({ ...a, engagementId: input.engagementId });
      }
      return { synced: input.answers.length };
    }),

  saveFindingOverride: authedQuery
    .input(
      z.object({
        engagementId: z.number(),
        findingKey: z.string().min(1).max(160),
        owner: z.string().max(255).nullable().default(null),
        dueDate: z.string().max(32).nullable().default(null),
        status: z.string().max(32).nullable().default(null),
        response: z.string().max(20000).nullable().default(null),
        inReport: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnership(input.engagementId, ctx.user.id);
      await upsertFindingOverride(input);
    }),
});
