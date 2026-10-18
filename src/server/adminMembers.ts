import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";
import type { AdminPrincipal } from "./adminAuth";
import { updateMemberEmailAndSync } from "./authAdmin";
import {
  dispatchTransactionalEmail,
  renderWelcomeEmail,
  resolvePublicOrigin,
} from "./email";
import { deriveInitials, deriveSlugBase } from "@/lib/memberNames";

export { deriveInitials, deriveSlugBase };

export interface AdminMemberListItem {
  id: string;
  groupId: string;
  slug: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  isActive: number;
  sortOrder: number;
  createdAt: number;
  ownedPassLabels: string[];
  holdsPassLabels: string[];
  userId?: string | null;
  email?: string | null;
  role?: string | null;
}

export const DISTINCT_AVATAR_COLORS = [
  "#E30613", // Red
  "#2563EB", // Blue
  "#D97706", // Amber
  "#059669", // Emerald
  "#7C3AED", // Violet
  "#DB2777", // Pink
  "#0891B2", // Cyan
  "#4F46E5", // Indigo
  "#EA580C", // Orange-Red
  "#16A34A", // Green
  "#9333EA", // Purple
  "#0D9488", // Teal
  "#CA8A04", // Gold
  "#E11D48", // Rose
  "#475569", // Slate
  "#0284C7", // Sky
];

export interface CreateMemberInput {
  displayName: string;
  initials?: string;
  avatarColor?: string;
  sortOrder?: number;
  email?: string;
  role?: "admin" | "member";
}

export type MemberUpdatableField =
  | "displayName"
  | "initials"
  | "avatarColor"
  | "sortOrder"
  | "isActive"
  | "email"
  | "role";

export type DeactivatableCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "holds_pass" | "is_owner" | "in_open_queue";
      details?: string;
    };

export async function resolveAdminGroup(db: DbClient) {
  const allGroups = await db.query.groups.findMany();
  if (allGroups.length === 0) {
    throw new Error("No group found in database");
  }
  if (allGroups.length > 1) {
    throw new Error(`Expected exactly 1 group in database, found ${allGroups.length}`);
  }
  return allGroups[0]!;
}

export async function deriveSlug(db: DbClient, groupId: string, displayName: string): Promise<string> {
  const base = deriveSlugBase(displayName);
  const pattern = `${base}%`;
  const existingWithPrefix = await db.query.members.findMany({
    where: and(eq(schema.members.groupId, groupId), sql`${schema.members.slug} LIKE ${pattern}`),
  });

  const existingSlugs = new Set(existingWithPrefix.map((m) => m.slug));
  if (!existingSlugs.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingSlugs.has(`${base}-${counter}`)) {
    counter++;
  }
  return `${base}-${counter}`;
}

export async function pickDistinctAvatarColor(db: DbClient, groupId: string): Promise<string> {
  const existingMembers = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId),
  });
  const usedCounts = new Map<string, number>();
  for (const c of DISTINCT_AVATAR_COLORS) {
    usedCounts.set(c.toUpperCase(), 0);
  }
  for (const m of existingMembers) {
    const uc = m.avatarColor.toUpperCase();
    usedCounts.set(uc, (usedCounts.get(uc) ?? 0) + 1);
  }

  // Sort palette by least used count
  const sorted = [...DISTINCT_AVATAR_COLORS].sort(
    (a, b) => (usedCounts.get(a.toUpperCase()) ?? 0) - (usedCounts.get(b.toUpperCase()) ?? 0)
  );
  const minCount = usedCounts.get(sorted[0]!.toUpperCase()) ?? 0;
  const leastUsed = sorted.filter((c) => (usedCounts.get(c.toUpperCase()) ?? 0) === minCount);
  return leastUsed[Math.floor(Math.random() * leastUsed.length)] || sorted[0]!;
}

export async function listAdminMembers(db: DbClient, groupId: string): Promise<AdminMemberListItem[]> {
  const allMembers = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId),
    orderBy: [asc(schema.members.sortOrder), asc(schema.members.createdAt)],
  });

  const allPasses = await db.query.passes.findMany({
    where: eq(schema.passes.groupId, groupId),
  });

  const passIdToLabel = new Map(allPasses.map((p) => [p.id, p.label]));
  const holderMap = new Map<string, string[]>(); // memberId -> passLabels
  for (const pass of allPasses) {
    if (pass.holderMemberId) {
      const existing = holderMap.get(pass.holderMemberId) ?? [];
      existing.push(pass.label);
      holderMap.set(pass.holderMemberId, existing);
    }
  }

  const passIds = allPasses.map((p) => p.id);
  const allOwnerships =
    passIds.length > 0
      ? await db.query.passOwners.findMany({
          where: inArray(schema.passOwners.passId, passIds),
        })
      : [];

  const ownerMap = new Map<string, string[]>(); // memberId -> passLabels
  for (const po of allOwnerships) {
    const label = passIdToLabel.get(po.passId);
    if (label) {
      const existing = ownerMap.get(po.memberId) ?? [];
      existing.push(label);
      ownerMap.set(po.memberId, existing);
    }
  }

  const userIds = allMembers
    .map((m) => m.userId)
    .filter((id): id is string => Boolean(id));
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db.query.auth_user.findMany({
      where: inArray(schema.auth_user.id, userIds),
    });
    for (const u of users) {
      userMap.set(u.id, u.email);
    }
  }

  return allMembers.map((m) => ({
    id: m.id,
    groupId: m.groupId,
    slug: m.slug,
    displayName: m.displayName,
    initials: m.initials,
    avatarColor: m.avatarColor,
    isActive: m.isActive,
    sortOrder: m.sortOrder,
    createdAt: m.createdAt,
    ownedPassLabels: ownerMap.get(m.id) ?? [],
    holdsPassLabels: holderMap.get(m.id) ?? [],
    userId: m.userId,
    email: m.userId ? userMap.get(m.userId) ?? null : null,
    role: m.role,
  }));
}

export async function assertDeactivatable(db: DbClient, memberId: string): Promise<DeactivatableCheckResult> {
  // 1. Check if member holds a physical card
  const heldPass = await db.query.passes.findFirst({
    where: eq(schema.passes.holderMemberId, memberId),
  });
  if (heldPass) {
    return { ok: false, reason: "holds_pass", details: heldPass.label };
  }

  // 2. Check if member appears in pass_owners
  const ownership = await db.query.passOwners.findFirst({
    where: eq(schema.passOwners.memberId, memberId),
  });
  if (ownership) {
    return { ok: false, reason: "is_owner" };
  }

  // 3. Check if member has waiting or assigned queue entry in open pool
  const openPools = await db.query.gamePools.findMany({
    where: eq(schema.gamePools.status, "open"),
  });
  const openPoolIds = openPools.map((p) => p.id);

  if (openPoolIds.length > 0) {
    const activeEntry = await db.query.queueEntries.findFirst({
      where: and(
        eq(schema.queueEntries.memberId, memberId),
        inArray(schema.queueEntries.gamePoolId, openPoolIds),
        inArray(schema.queueEntries.status, ["waiting", "assigned"])
      ),
    });
    if (activeEntry) {
      return { ok: false, reason: "in_open_queue" };
    }
  }

  return { ok: true };
}

export interface MemberMutationDispatchOptions {
  env?: Record<string, unknown>;
  cfCtx?: { ctx?: { waitUntil?: (p: Promise<unknown>) => void } };
}

export async function createMember(
  db: DbClient,
  groupId: string,
  input: CreateMemberInput,
  principal: AdminPrincipal,
  options?: MemberMutationDispatchOptions
) {
  // Note: Direct D1 write, not mutate().
  // Members sit outside the GamePoolState aggregate, have no version column,
  // and have no FCFS queue ordering semantics.
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId),
  });
  if (!group) {
    throw new Error(`Group ${groupId} not found`);
  }

  const slug = await deriveSlug(db, groupId, input.displayName);
  const initials = input.initials?.trim() || deriveInitials(input.displayName);
  const avatarColor = input.avatarColor?.trim() || (await pickDistinctAvatarColor(db, groupId));
  const memberId = `member_${group.slug}_${slug}`;

  let sortOrder = input.sortOrder;
  if (sortOrder === undefined || sortOrder === null) {
    const maxSortRow = await db.query.members.findFirst({
      where: eq(schema.members.groupId, groupId),
      orderBy: [desc(schema.members.sortOrder)],
    });
    sortOrder = (maxSortRow?.sortOrder ?? 0) + 1;
  }

  const now = Math.floor(Date.now() / 1000);
  const statements: any[] = [];
  let userId: string | null = null;

  if (input.email && input.email.trim() !== "") {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existingUser = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, normalizedEmail),
    });
    if (existingUser) {
      // Check if user is already linked to another member in the same group
      const existingMember = await db.query.members.findFirst({
        where: and(
          eq(schema.members.groupId, groupId),
          eq(schema.members.userId, existingUser.id)
        ),
      });
      if (existingMember) {
        throw new Error(`Email "${normalizedEmail}" is already linked to member "${existingMember.displayName}" in this group`);
      }
      userId = existingUser.id;
    } else {
      userId = crypto.randomUUID();
      const userDate = new Date();
      statements.push(
        db.insert(schema.auth_user).values({
          id: userId,
          email: normalizedEmail,
          name: input.displayName.trim(),
          emailVerified: false,
          role: "user",
          banned: false,
          createdAt: userDate,
          updatedAt: userDate,
        })
      );
    }
  }

  const memberValues = {
    id: memberId,
    groupId,
    userId,
    role: input.role ?? "member",
    slug,
    displayName: input.displayName.trim(),
    initials,
    avatarColor,
    isActive: 1,
    sortOrder,
    createdAt: now,
  };

  const auditEventId = `evt_member_created_${memberId}_${now}`;
  const auditEventValues = {
    id: auditEventId,
    gamePoolId: null,
    passId: null,
    actorMemberId: principal.memberId,
    type: "member.created",
    payloadJson: JSON.stringify({
      actor: principal.subject,
      memberId,
      slug,
      displayName: memberValues.displayName,
      initials: memberValues.initials,
      avatarColor: memberValues.avatarColor,
      sortOrder: memberValues.sortOrder,
      email: input.email ? input.email.trim() : null,
      role: memberValues.role,
    }),
    idempotencyKey: null,
    createdAt: now,
  };

  const insertMemberStmt = db.insert(schema.members).values(memberValues);
  const insertAuditStmt = db.insert(schema.activityEvents).values(auditEventValues);

  statements.push(insertMemberStmt, insertAuditStmt);
  await db.batch(statements as any);

  if (input.email && input.email.trim() !== "") {
    const normalizedEmail = input.email.toLowerCase().trim();
    const club = group.clubId
      ? await db.query.clubs.findFirst({
          where: eq(schema.clubs.id, group.clubId),
        })
      : null;
    const payload = renderWelcomeEmail({
      to: normalizedEmail,
      displayName: memberValues.displayName,
      groupName: group.name,
      baseUrl: resolvePublicOrigin(options?.env),
      colorPrimary: club?.colorPrimary,
      colorOnPrimary: club?.colorOnPrimary,
    });
    await dispatchTransactionalEmail({
      payload,
      kind: "welcome",
      trigger: "member_created",
      memberId,
      db,
      env: options?.env,
      cfCtx: options?.cfCtx,
    });
  }

  return memberValues;
}

export async function reorderMembers(
  db: DbClient,
  groupId: string,
  orderedMemberIds: string[],
  principal: AdminPrincipal
) {
  // Validate that orderedMemberIds is a complete duplicate-free permutation of the group's members
  const existingMembers = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId),
  });

  const existingIds = new Set(existingMembers.map((m) => m.id));
  const providedIds = new Set(orderedMemberIds);

  if (
    orderedMemberIds.length !== existingMembers.length ||
    providedIds.size !== existingMembers.length ||
    orderedMemberIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error(
      `Invalid member reorder payload: expected complete permutation of ${existingMembers.length} members in group ${groupId}`
    );
  }

  // Direct guarded write: update sortOrder sequentially to 1, 2, 3...
  const statements: any[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (let index = 0; index < orderedMemberIds.length; index++) {
    const memberId = orderedMemberIds[index]!;
    statements.push(
      db
        .update(schema.members)
        .set({ sortOrder: index + 1 })
        .where(and(eq(schema.members.id, memberId), eq(schema.members.groupId, groupId)))
    );
  }

  const auditEventId = `evt_members_reordered_${groupId}_${now}_${Math.random().toString(36).slice(2, 7)}`;
  statements.push(
    db.insert(schema.activityEvents).values({
      id: auditEventId,
      gamePoolId: null,
      passId: null,
      actorMemberId: principal.memberId,
      type: "members.reordered",
      payloadJson: JSON.stringify({
        actor: principal.subject,
        groupId,
        orderedMemberIds,
      }),
      idempotencyKey: null,
      createdAt: now,
    })
  );

  await db.batch(statements as any);
  return { ok: true };
}

export async function updateMember(
  db: DbClient,
  memberId: string,
  patch: Partial<{
    displayName: string;
    initials: string;
    avatarColor: string;
    sortOrder: number;
    isActive: number;
    email: string;
    role: "admin" | "member";
  }>,
  allowedFields: MemberUpdatableField[],
  principal: AdminPrincipal,
  options?: MemberMutationDispatchOptions
) {
  // Note: Direct D1 write, not mutate(). Members sit outside GamePoolState.
  const existing = await db.query.members.findFirst({
    where: eq(schema.members.id, memberId),
  });
  if (!existing) {
    throw new Error(`Member ${memberId} not found`);
  }

  let wasPreviouslyUnlinked = !existing.userId;
  if (!wasPreviouslyUnlinked && existing.userId) {
    const existingUser = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.id, existing.userId),
    });
    if (!existingUser || !existingUser.email || existingUser.email.trim() === "") {
      wasPreviouslyUnlinked = true;
    }
  }
  let newlyLinkedEmail: string | null = null;

  const updateData: Record<string, unknown> = {};
  const changedFields: string[] = [];

  for (const field of allowedFields) {
    if (field in patch) {
      if (field === "displayName" && typeof patch.displayName === "string") {
        const val = patch.displayName.trim();
        if (val !== existing.displayName) {
          updateData.displayName = val;
          changedFields.push("displayName");
        }
      } else if (field === "initials" && typeof patch.initials === "string") {
        const val = patch.initials.trim();
        if (val !== existing.initials) {
          updateData.initials = val;
          changedFields.push("initials");
        }
      } else if (field === "avatarColor" && typeof patch.avatarColor === "string") {
        const val = patch.avatarColor.trim();
        if (val !== existing.avatarColor) {
          updateData.avatarColor = val;
          changedFields.push("avatarColor");
        }
      } else if (field === "sortOrder" && typeof patch.sortOrder === "number") {
        if (patch.sortOrder !== existing.sortOrder) {
          updateData.sortOrder = patch.sortOrder;
          changedFields.push("sortOrder");
        }
      } else if (field === "isActive" && typeof patch.isActive === "number") {
        if (patch.isActive !== existing.isActive) {
          if (patch.isActive === 0) {
            const deactivatable = await assertDeactivatable(db, memberId);
            if (!deactivatable.ok) {
              return { error: "deactivation_blocked" as const, ...deactivatable };
            }
          }
          updateData.isActive = patch.isActive;
          changedFields.push("isActive");
        }
      } else if (field === "role" && (patch.role === "admin" || patch.role === "member")) {
        if (patch.role !== existing.role) {
          updateData.role = patch.role;
          changedFields.push("role");
        }
      } else if (field === "email" && typeof patch.email === "string" && patch.email.trim() !== "") {
        const normalizedEmail = patch.email.toLowerCase().trim();
        await updateMemberEmailAndSync(
          db,
          memberId,
          normalizedEmail,
          (patch.displayName as string) || existing.displayName
        );
        changedFields.push("email");
        if (wasPreviouslyUnlinked) {
          newlyLinkedEmail = normalizedEmail;
        }
      }
    }
  }

  if (changedFields.length === 0) {
    return { ok: true as const, member: existing, changed: [] };
  }

  const now = Math.floor(Date.now() / 1000);
  const auditEventId = `evt_member_updated_${memberId}_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const auditEventValues = {
    id: auditEventId,
    gamePoolId: null,
    passId: null,
    actorMemberId: principal.memberId,
    type: "member.updated",
    payloadJson: JSON.stringify({
      actor: principal.subject,
      memberId,
      changed: changedFields,
      patch: updateData,
    }),
    idempotencyKey: null,
    createdAt: now,
  };

  const statements: any[] = [];
  if (Object.keys(updateData).length > 0) {
    statements.push(
      db
        .update(schema.members)
        .set(updateData)
        .where(eq(schema.members.id, memberId))
    );
  }

  const auditStmt = db.insert(schema.activityEvents).values(auditEventValues);
  statements.push(auditStmt);

  await db.batch(statements as any);

  const updatedMember = await db.query.members.findFirst({
    where: eq(schema.members.id, memberId),
  });

  if (newlyLinkedEmail && updatedMember) {
    const group = await db.query.groups.findFirst({
      where: eq(schema.groups.id, updatedMember.groupId),
    });
    const club = group?.clubId
      ? await db.query.clubs.findFirst({
          where: eq(schema.clubs.id, group.clubId),
        })
      : null;
    const payload = renderWelcomeEmail({
      to: newlyLinkedEmail,
      displayName: updatedMember.displayName,
      groupName: group?.name,
      baseUrl: resolvePublicOrigin(options?.env),
      colorPrimary: club?.colorPrimary,
      colorOnPrimary: club?.colorOnPrimary,
    });
    await dispatchTransactionalEmail({
      payload,
      kind: "welcome",
      trigger: "member_email_linked",
      memberId: updatedMember.id,
      db,
      env: options?.env,
      cfCtx: options?.cfCtx,
    });
  }

  return { ok: true as const, member: updatedMember!, changed: changedFields };
}
