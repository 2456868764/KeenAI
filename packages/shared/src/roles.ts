import { z } from "zod";

export const memberRoleSchema = z.enum(["owner", "admin", "agent", "lite"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const MEMBER_ROLES = memberRoleSchema.options;
