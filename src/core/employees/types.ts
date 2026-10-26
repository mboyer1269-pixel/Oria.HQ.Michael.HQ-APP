/** Presentation directory only. These IDs never enter the execution registry. */
export type EmployeeScope = { ownerId: string; workspaceId: string; ventureId: string };
export type EmployeeFields = {
  displayName: string;
  specialty: string;
  instructions: string;
  assignmentRole: string;
  assignmentContext: string;
};
export type EmployeeProfile = EmployeeFields & {
  id: string;
  ownerId: string;
  workspaceId: string;
  ventureId: string;
  state: "draft" | "archived";
  revision: number;
};
export type EmployeeFailure = { status: "invalid" | "forbidden" | "unavailable" | "conflict"; message: string };
export type EmployeeListResult = { status: "ready"; employees: EmployeeProfile[] } | EmployeeFailure;
export type EmployeeWriteResult = { status: "saved"; employee: EmployeeProfile } | EmployeeFailure;
export type EmployeeCommand =
  | ({ operation: "create"; creationKey: string } & EmployeeFields)
  | ({ operation: "edit"; id: string; revision: number } & EmployeeFields)
  | { operation: "archive"; id: string; revision: number };
/** One insert contains profile AND immutable single-business assignment. No global array update. */
export interface EmployeeStore {
  list(scope: EmployeeScope): Promise<EmployeeProfile[]>;
  create(scope: EmployeeScope, fields: EmployeeFields, creationKey: string): Promise<EmployeeProfile | null>;
  change(scope: EmployeeScope, command: Exclude<EmployeeCommand, { operation: "create" }>): Promise<EmployeeProfile | null>;
}
