import { z } from "zod";
import { foundationModelIdSchema, observedProviderModelIdSchema } from "./openhands-launch-contract";

/** Existing privileged lifecycle channel only; never an execution/test verdict. */
export const OPENHANDS_RESULT_KEY = "_openhandsResult";
export const OPENHANDS_RESULT_MAX_BYTES = 1024 * 1024;
export const OPENHANDS_RESULT_REQUEST_MAX_BYTES = OPENHANDS_RESULT_MAX_BYTES + 16384;
const encoder = new TextEncoder();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = (limit: number) => z.string().max(limit).refine(value =>
  encoder.encode(value).length <= limit && Array.from(value).every(character => {
    const point = character.codePointAt(0)!;
    return (point >= 32 || "\r\n\t".includes(character)) && !(point >= 0xd800 && point <= 0xdfff);
  })
  && !/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b|(?:authorization\s*[:=]\s*["']?bearer\s+|(?:api[_-]?key|password|access[_-]?token)\s*[:=]\s*["']?\S{8,})/i.test(value));
const relativePath = z.string().min(1).max(240).regex(/^[A-Za-z0-9_./ -]+$/).refine(value =>
  !value.startsWith("/") && value.split("/").every(part => {
    const lower = part.toLowerCase();
    return !["", ".", "..", ".git", ".ssh", ".aws", ".azure", ".config", ".npmrc", ".netrc"].includes(lower)
      && !lower.startsWith(".env") && !lower.startsWith("id_rsa")
      && !/(credential|secret|token)|\.(pem|key|p12|pfx)$/.test(lower);
  }));
const summarySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing"), text: z.null() }).strict(),
  z.object({ status: z.literal("present"), path: relativePath, text: text(128 * 1024),
    sha256: digest, source: z.literal("selected_checkout_file") }).strict(),
]);
const observedTokens = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const modelExecutionSchema = z.object({
  requestedModelId: foundationModelIdSchema.nullable(),
  acpConfirmedModelId: foundationModelIdSchema.nullable(),
  observedModelIds: z.array(observedProviderModelIdSchema).max(32).nullable(),
  mainLoopUsage: z.object({inputTokens:observedTokens,outputTokens:observedTokens,
    cachedReadTokens:observedTokens,cachedWriteTokens:observedTokens,thoughtTokens:observedTokens}).strict().nullable(),
  modelUsage: z.array(z.object({modelId:observedProviderModelIdSchema,inputTokens:observedTokens,outputTokens:observedTokens,
    cachedReadTokens:observedTokens,cachedWriteTokens:observedTokens,totalTokens:observedTokens,reasoningOutputTokens:observedTokens}).strict()).max(32).nullable(),
}).strict();

export const openHandsResultSchema = z.object({
  contractVersion: z.literal(1), launchId: z.uuid(), workspaceId: z.string().min(1).max(160), missionId: z.uuid(),
  commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/), payloadHash: digest,
  independentValidationPassed: z.literal(false), validation: z.literal("not_performed"),
  availability: z.literal("outcome_present"), executionState: z.enum(["agent_returned", "execution_error", "cleanup_error", "connection_required", "model_selection_required"]),
  modelSelection: z.literal("not_confirmed").optional(),
  modelExecution: modelExecutionSchema.optional(),
  authentication: z.literal("local_subscription_not_confirmed").optional(),
  sdkExecutionStatus: z.string().regex(/^[A-Za-z_]{1,64}$/).nullable(),
  summary: summarySchema,
  files: z.array(z.object({ path: relativePath,
    status: z.enum(["missing", "added", "deleted", "unchanged", "modified"]),
    diff: text(OPENHANDS_RESULT_MAX_BYTES), sha256: digest.nullable() }).strict()).max(32),
  diffScope: z.literal("selected_file_contents_only"),
}).strict().superRefine((report, ctx) => {
  if (report.executionState === "model_selection_required"
    ? report.modelSelection !== "not_confirmed" || report.sdkExecutionStatus !== null || report.modelExecution?.acpConfirmedModelId != null
    : report.modelSelection !== undefined)
    ctx.addIssue({code:"custom",message:"Model selection diagnostic mismatch"});
  if (report.modelExecution?.acpConfirmedModelId != null && report.modelExecution.acpConfirmedModelId !== report.modelExecution.requestedModelId)
    ctx.addIssue({code:"custom",message:"Confirmed model differs from requested model"});
  if (report.executionState === "connection_required"
    ? report.authentication !== "local_subscription_not_confirmed" || report.sdkExecutionStatus !== null
    : report.authentication !== undefined)
    ctx.addIssue({ code: "custom", message: "Connection diagnostic mismatch" });
  if (encoder.encode(JSON.stringify(report)).length > OPENHANDS_RESULT_MAX_BYTES)
    ctx.addIssue({ code: "custom", message: "Result size limit exceeded" });
  if (new Set(report.files.map(file => file.path)).size !== report.files.length)
    ctx.addIssue({ code: "custom", message: "Duplicate result path" });
  if (report.summary.status === "present") {
    const summary = report.summary;
    const file = report.files.find(file => file.path === summary.path);
    if (!file || file.sha256 !== summary.sha256 || file.status === "missing" || file.status === "deleted")
      ctx.addIssue({ code: "custom", message: "Summary file mismatch" });
  }
  for (const file of report.files) {
    if ((file.status === "missing" || file.status === "deleted") !== (file.sha256 === null))
      ctx.addIssue({ code: "custom", message: "Result file status mismatch" });
  }
});
export type OpenHandsResult = z.infer<typeof openHandsResultSchema>;
export const openHandsResultReceiptSchema = z.object({ version: z.literal(1), receivedAt: z.iso.datetime({ offset: true }),
  contentHash: digest, report: openHandsResultSchema }).strict();
export type OpenHandsResultReceipt = z.infer<typeof openHandsResultReceiptSchema>;
