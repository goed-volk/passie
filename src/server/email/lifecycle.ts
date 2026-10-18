import { eq } from "drizzle-orm";
import type { DbClient } from "../db";
import * as schema from "../schema";
import * as authSchema from "../authSchema";
import type { ActivityEvent } from "../../domain/types";
import { renderPassAssignedEmail } from "./template";
import { dispatchTransactionalEmail, resolvePublicOrigin } from "./dispatch";

export function formatDutchKickoff(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const datePart = date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  });
  const timePart = date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
  return `${datePart} om ${timePart}`;
}

export function formatDutchDeadline(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const datePart = date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Amsterdam",
  });
  const timePart = date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
  return `${datePart} om ${timePart}`;
}

export interface LifecycleDispatchOptions {
  env?: Record<string, unknown>;
  cfCtx?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } };
}

export async function dispatchPassAssignedEmails(
  db: DbClient,
  gamePoolId: string,
  events: ActivityEvent[],
  options?: LifecycleDispatchOptions
): Promise<void> {
  const assignedEvents = events.filter((e) => e.type === "pass.assigned");
  if (assignedEvents.length === 0) {
    return;
  }

  const pool = await db.query.gamePools.findFirst({
    where: eq(schema.gamePools.id, gamePoolId),
  });
  if (!pool) return;

  const fixture = await db.query.fixtures.findFirst({
    where: eq(schema.fixtures.id, pool.fixtureId),
  });
  if (!fixture) return;

  const club = await db.query.clubs.findFirst({
    where: eq(schema.clubs.id, fixture.clubId),
  });
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, pool.groupId),
  });

  const clubShortName = club?.shortName || "Excelsior";
  const matchLabel = `${clubShortName} - ${fixture.opponent}`;
  const kickoffFormatted = formatDutchKickoff(fixture.kickoffAt);
  const venue = fixture.venue;
  const groupName = group?.name || clubShortName;
  const baseUrl = resolvePublicOrigin(options?.env);

  for (const event of assignedEvents) {
    const payload = event.payload as {
      passId: string;
      claimantEntryId?: number;
      memberId?: string;
      kind?: "self" | "guest";
      guestName?: string | null;
    };

    let memberId = payload.memberId;
    let kind = payload.kind ?? "self";
    let guestName = payload.guestName ?? null;

    if (!memberId && payload.claimantEntryId) {
      const qe = await db.query.queueEntries.findFirst({
        where: eq(schema.queueEntries.id, payload.claimantEntryId),
      });
      if (qe) {
        memberId = qe.memberId;
        kind = qe.kind;
        guestName = qe.guestName;
      }
    }

    if (!memberId) continue;

    const claimantMember = await db.query.members.findFirst({
      where: eq(schema.members.id, memberId),
    });
    if (!claimantMember?.userId) continue;

    const authUser = await db.query.auth_user.findFirst({
      where: eq(authSchema.auth_user.id, claimantMember.userId),
    });
    if (!authUser?.email || authUser.email.trim() === "") continue;

    const pass = await db.query.passes.findFirst({
      where: eq(schema.passes.id, payload.passId),
    });
    if (!pass) continue;

    let currentHolderName = "de groep";
    if (pass.holderMemberId) {
      const holderMember = await db.query.members.findFirst({
        where: eq(schema.members.id, pass.holderMemberId),
      });
      if (holderMember?.displayName) {
        currentHolderName = holderMember.displayName;
      }
    }

    const emailPayload = renderPassAssignedEmail({
      to: authUser.email.trim().toLowerCase(),
      claimantName: claimantMember.displayName,
      kind,
      guestName,
      matchLabel,
      kickoffFormatted,
      venue,
      passLabel: pass.label,
      seatInfo: pass.seatInfo,
      currentHolderName,
      groupName,
      baseUrl,
      colorPrimary: club?.colorPrimary,
      colorOnPrimary: club?.colorOnPrimary,
    });

    await dispatchTransactionalEmail({
      payload: emailPayload,
      kind: "pass_assigned",
      trigger: "pool_mutation",
      memberId: claimantMember.id,
      db,
      env: options?.env,
      cfCtx: options?.cfCtx,
    });
  }
}
