import { eq, and } from "drizzle-orm";
import type { DbClient } from "./db";
import * as schema from "./schema";

export interface PreCreateUserOptions {
  email: string;
  name: string;
  memberId: string;
  role?: string;
}

export async function preCreateUserAndLink(
  db: DbClient,
  options: PreCreateUserOptions
): Promise<{ userId: string; created: boolean }> {
  const normalizedEmail = options.email.toLowerCase().trim();

  // Check if an auth_user with this email already exists
  const existingUser = await db.query.auth_user.findFirst({
    where: eq(schema.auth_user.email, normalizedEmail),
  });

  const now = new Date();

  if (existingUser) {
    // Link member to existing auth_user
    await db
      .update(schema.members)
      .set({ userId: existingUser.id })
      .where(eq(schema.members.id, options.memberId));

    return { userId: existingUser.id, created: false };
  }

  const userId = crypto.randomUUID();

  // Create auth_user and link members row atomically in a batch
  await db.batch([
    db.insert(schema.auth_user).values({
      id: userId,
      email: normalizedEmail,
      name: options.name.trim(),
      emailVerified: false,
      role: options.role ?? "user",
      banned: false,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .update(schema.members)
      .set({ userId })
      .where(eq(schema.members.id, options.memberId)),
  ]);

  return { userId, created: true };
}

export async function setPlatformRole(
  db: DbClient,
  userId: string,
  role: "admin" | "user"
): Promise<void> {
  await db
    .update(schema.auth_user)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.auth_user.id, userId));
}

export async function setBanned(
  db: DbClient,
  userId: string,
  banned: boolean
): Promise<void> {
  if (banned) {
    // When banning, revoke all active sessions in the same batch
    await db.batch([
      db
        .update(schema.auth_user)
        .set({ banned: true, updatedAt: new Date() })
        .where(eq(schema.auth_user.id, userId)),
      db.delete(schema.auth_session).where(eq(schema.auth_session.userId, userId)),
    ]);
  } else {
    await db
      .update(schema.auth_user)
      .set({ banned: false, updatedAt: new Date() })
      .where(eq(schema.auth_user.id, userId));
  }
}

export async function revokeUserSessions(
  db: DbClient,
  userId: string
): Promise<void> {
  await db.delete(schema.auth_session).where(eq(schema.auth_session.userId, userId));
}

export async function updateMemberEmailAndSync(
  db: DbClient,
  memberId: string,
  newEmail: string,
  name: string
): Promise<{ userId: string }> {
  const normalizedEmail = newEmail.toLowerCase().trim();

  const member = await db.query.members.findFirst({
    where: eq(schema.members.id, memberId),
  });

  if (!member) {
    throw new Error(`Member ${memberId} not found`);
  }

  if (member.userId) {
    const currentUser = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.id, member.userId),
    });

    if (currentUser && currentUser.email === normalizedEmail) {
      return { userId: member.userId };
    }

    // Email changed: check if target email belongs to another user
    const existingWithNewEmail = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, normalizedEmail),
    });

    if (existingWithNewEmail) {
      // Re-link member to the other user and revoke sessions on old user
      await db.batch([
        db
          .update(schema.members)
          .set({ userId: existingWithNewEmail.id })
          .where(eq(schema.members.id, memberId)),
        db.delete(schema.auth_session).where(eq(schema.auth_session.userId, member.userId)),
      ]);
      return { userId: existingWithNewEmail.id };
    }

    // Update existing user email and revoke active sessions per D-18
    await db.batch([
      db
        .update(schema.auth_user)
        .set({
          email: normalizedEmail,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.auth_user.id, member.userId)),
      db.delete(schema.auth_session).where(eq(schema.auth_session.userId, member.userId)),
    ]);

    return { userId: member.userId };
  }

  // Member had no user yet
  return preCreateUserAndLink(db, {
    email: normalizedEmail,
    name,
    memberId,
  });
}
