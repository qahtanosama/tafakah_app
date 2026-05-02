"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "login"
  | "logout"
  | "role_change"
  | "password_reset"
  | "account_create"
  | "account_disable"
  | "account_enable"
  | "impersonation_start"
  | "impersonation_end"
  | "client_login_create";

export interface AuditEvent {
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: AuditAction;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetResourceType?: string;
  targetResourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append an audit row. Best-effort — never let logging failure block the
 * caller's main action (we swallow errors and just console.error).
 *
 * If `ipAddress` / `userAgent` aren't supplied, we try to read them from the
 * incoming request headers via `next/headers` (only available inside server
 * actions / route handlers, not at module init time).
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    let ip = event.ipAddress ?? null;
    let ua = event.userAgent ?? null;
    if (ip === null || ua === null) {
      try {
        const h = await headers();
        if (ip === null) {
          ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            h.get("x-real-ip") ??
            null;
        }
        if (ua === null) ua = h.get("user-agent") ?? null;
      } catch {
        // Called outside a request context; that's fine.
      }
    }

    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_user_id: event.actorUserId,
      actor_email: event.actorEmail,
      actor_role: event.actorRole,
      action: event.action,
      target_user_id: event.targetUserId ?? null,
      target_email: event.targetEmail ?? null,
      target_resource_type: event.targetResourceType ?? null,
      target_resource_id: event.targetResourceId ?? null,
      metadata: event.metadata ?? {},
      ip_address: ip,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[audit] Failed to log event:", err);
  }
}
