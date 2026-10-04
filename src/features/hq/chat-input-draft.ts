/** Tab-local unsent input, not conversation history or an API request identifier. */
export const CHAT_INPUT_TTL_MS = 24 * 60 * 60 * 1000;
export type ChatInputDraft = { id: string; text: string };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function chatInputDraftKey(workspaceId: string) { return `oria:chat-unsent:${workspaceId}`; }
function validDraft(value: ChatInputDraft) {
  return typeof value.id === "string" && /^[a-f0-9-]{36}$/i.test(value.id)
    && typeof value.text === "string" && value.text.length <= 4000;
}
export function readChatInputDraft(storage: DraftStorage, workspaceId: string, now = Date.now()):
  { status: "ready"; draft: ChatInputDraft } | { status: "absent" | "invalid" | "unavailable" } {
  try {
    const key=chatInputDraftKey(workspaceId),raw=storage.getItem(key);
    if(raw===null)return {status:"absent"};
    let data: Record<string,unknown>|null=null;
    try{if(raw.length<=25000)data=JSON.parse(raw);}catch{/* Discard invalid input below. */}
    if(!data||Object.keys(data).sort().join(",")!=="expiresAt,id,text,version,workspaceId"
      ||data.version!==1||data.workspaceId!==workspaceId||!validDraft(data as ChatInputDraft)
      ||typeof data.expiresAt!=="number"||!Number.isFinite(data.expiresAt)
      ||data.expiresAt<=now||data.expiresAt>now+CHAT_INPUT_TTL_MS){storage.removeItem(key);return {status:"invalid"};}
    return {status:"ready",draft:{id:data.id as string,text:data.text as string}};
  }catch{return {status:"unavailable"};}
}
export function saveChatInputDraft(storage: DraftStorage, workspaceId: string, draft: ChatInputDraft, now=Date.now()):boolean {
  if(!validDraft(draft))return false;
  try{storage.setItem(chatInputDraftKey(workspaceId),JSON.stringify({version:1,workspaceId,id:draft.id,text:draft.text,expiresAt:now+CHAT_INPUT_TTL_MS}));return true;}
  catch{return false;}
}
/** A successful old response cannot erase text edited while it was pending. */
export function clearSentChatInputDraft(storage: DraftStorage,workspaceId:string,sentId:string,now=Date.now()):boolean {
  const current=readChatInputDraft(storage,workspaceId,now);
  if(current.status==="unavailable")return false;
  if(current.status!=="ready"||current.draft.id!==sentId)return true;
  try{storage.removeItem(chatInputDraftKey(workspaceId));return true;}catch{return false;}
}
