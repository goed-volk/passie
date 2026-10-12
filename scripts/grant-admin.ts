import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/schema";
import { setPlatformRole } from "../src/server/authAdmin";

async function main() {
  const args = process.argv.slice(2);

  let memberSlug: string | undefined;
  let userEmail: string | undefined;
  let platformAdmin = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--member" && args[i + 1]) {
      memberSlug = args[i + 1];
    } else if (args[i] === "--email" && args[i + 1]) {
      userEmail = args[i + 1];
    } else if (args[i] === "--platform") {
      platformAdmin = true;
    }
  }

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });

  if (memberSlug) {
    const member = await db.query.members.findFirst({
      where: eq(schema.members.slug, memberSlug),
    });

    if (!member) {
      console.error(`Member with slug "${memberSlug}" not found.`);
      process.exit(1);
    }

    await db
      .update(schema.members)
      .set({ role: "admin" })
      .where(eq(schema.members.id, member.id));

    console.log(`Granted group admin role to member ${member.displayName} (${member.id}).`);

    if (platformAdmin && member.userId) {
      await setPlatformRole(db, member.userId, "admin");
      console.log(`Granted platform admin role to user ${member.userId}.`);
    }
    await proxy.dispose();
    process.exit(0);
  }

  if (userEmail) {
    const user = await db.query.auth_user.findFirst({
      where: eq(schema.auth_user.email, userEmail.toLowerCase().trim()),
    });

    if (!user) {
      console.error(`User with email "${userEmail}" not found.`);
      await proxy.dispose();
      process.exit(1);
    }

    await setPlatformRole(db, user.id, "admin");
    console.log(`Granted platform admin role to user ${user.id} (${user.email}).`);
    await proxy.dispose();
    process.exit(0);
  }

  console.log("Usage: pnpm tsx scripts/grant-admin.ts --member <slug> [--platform]");
  console.log("       pnpm tsx scripts/grant-admin.ts --email <email>");
  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
