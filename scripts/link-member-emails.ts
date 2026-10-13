import { getPlatformProxy } from "./proxy";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../src/server/schema";
import { preCreateUserAndLink } from "../src/server/authAdmin";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  // Read arguments: e.g. --member sam --email demo@goedvolk.org
  let memberSlug: string | undefined;
  let email: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--member" && args[i + 1]) {
      memberSlug = args[i + 1];
    } else if (args[i] === "--email" && args[i + 1]) {
      email = args[i + 1];
    }
  }

  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: "wrangler.jsonc",
    persist: { path: ".wrangler/state/v3" },
  });

  const db = drizzle(proxy.env.DB, { schema });

  if (memberSlug && email) {
    const member = await db.query.members.findFirst({
      where: eq(schema.members.slug, memberSlug),
    });

    if (!member) {
      console.error(`Member with slug "${memberSlug}" not found.`);
      process.exit(1);
    }

    console.log(`Linking member ${member.displayName} (${member.slug}) to email ${email}...`);

    if (dryRun) {
      console.log("[dry-run] Would link member to auth_user.");
      process.exit(0);
    }

    const res = await preCreateUserAndLink(db, {
      memberId: member.id,
      email,
      name: member.displayName,
    });

    console.log(`Linked successfully! userId: ${res.userId} (created: ${res.created})`);
    await proxy.dispose();
    process.exit(0);
  }

  // If no specific member provided, list all members and their linked status
  const members = await db.query.members.findMany();
  console.log(`Found ${members.length} members:`);
  for (const m of members) {
    let linkedEmail = "NOT LINKED";
    if (m.userId) {
      const u = await db.query.auth_user.findFirst({
        where: eq(schema.auth_user.id, m.userId),
      });
      if (u) linkedEmail = u.email;
    }
    console.log(`- ${m.displayName} (${m.slug}): ${linkedEmail} [role: ${m.role}]`);
  }
  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
