import { z } from "zod";

export const PAPERCLIP_PAGE_LIMIT = 50;
export const paperclipCompanyIdSchema = z.uuid();
const issueSchema = z.object({
  id: z.uuid(),
  companyId: paperclipCompanyIdSchema,
  projectId: z.uuid().nullable(),
  parentId: z.uuid().nullable(),
  title: z.string().min(1).max(2000),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"]),
  assigneeAgentId: z.uuid().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type PaperclipIssue = z.infer<typeof issueSchema>;

/** Parse the pinned API's full-list array, discarding all unneeded provider fields. */
export function parsePaperclipIssues(value: unknown, companyId: string): PaperclipIssue[] {
  const parsed = z.array(issueSchema).max(PAPERCLIP_PAGE_LIMIT).safeParse(value);
  if (!parsed.success || parsed.data.some((issue) => issue.companyId !== companyId)) {
    throw new Error("Invalid Paperclip issue response");
  }
  if (new Set(parsed.data.map((issue) => issue.id)).size !== parsed.data.length) {
    throw new Error("Invalid Paperclip issue response");
  }
  return parsed.data;
}
