import { closeMongoConnection } from "../lib/mongodb.ts";
import { upsertCompanyContact } from "../lib/offline-monitoring/company-contact-store.ts";

function getArgument(name: string) {
  const prefix = `--${name}=`;
  const inlineArgument = process.argv.find((argument) =>
    argument.startsWith(prefix),
  );

  if (inlineArgument) {
    return inlineArgument.slice(prefix.length);
  }

  const argumentIndex = process.argv.indexOf(`--${name}`);
  return argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined;
}

const companyName = getArgument("company");
const contactName = getArgument("contact");
const whatsappPhone = getArgument("phone");
const vehiclePlatesArgument = getArgument("plates");

if (!companyName || !contactName || !whatsappPhone) {
  console.error(
    "Usage: npm run offline:contact:upsert -- --company \"Company\" --contact \"Contact\" --phone \"549...\"",
  );
  process.exitCode = 1;
} else {
  try {
    const id = await upsertCompanyContact({
      system: "CYBERMAPA",
      companyName,
      contactName,
      whatsappPhone,
      ...(vehiclePlatesArgument
        ? { vehiclePlates: vehiclePlatesArgument.split(",") }
        : {}),
    });

    console.log(JSON.stringify({ success: true, id }));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "The contact update failed.",
    );
    process.exitCode = 1;
  } finally {
    await closeMongoConnection();
  }
}
