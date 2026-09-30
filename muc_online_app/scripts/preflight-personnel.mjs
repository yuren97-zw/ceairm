// Read-only: never loads server.mjs, seeds accounts, or runs migrations.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { preflightIdentity } from "../personnel-identity.mjs";
import { preflightOrganizations } from "../personnel-access.mjs";
import { preflightCapabilityIntegrity } from "../capability-integrity.mjs";

const target = process.argv[2];
if (!target) throw new Error("请显式提供待检查的SQLite文件路径");
const db = new DatabaseSync(path.resolve(target), {readOnly:true});
try {
  const identity = preflightIdentity(db), organizations = preflightOrganizations(db), capability = preflightCapabilityIntegrity(db);
  const counts = {};
  for (const table of ["personnel","users","record_recipients","read_receipts","personnel_licenses","personnel_authorizations","personnel_training_records","maintenance_assignments","maintenance_hour_results","maintenance_sortie_results","maintenance_report_entries","maintenance_report_drafts"]) counts[table] = db.prepare(`select count(*) as n from ${table}`).get().n;
  const hours = db.prepare("select coalesce(sum(hours),0) as calculated,coalesce(sum(adjusted_hours),0) as adjusted,coalesce(sum(coalesce(adjusted_hours,hours)),0) as effective from maintenance_hour_results").get();
  const sorties = db.prepare("select coalesce(sum(sorties),0) as total from maintenance_sortie_results").get();
  console.log(JSON.stringify({database:path.resolve(target),ok:identity.ok && organizations.ok && capability.ok,identity,organizations,capability,counts,hours,sorties},null,2));
  if (!identity.ok || !organizations.ok || !capability.ok) process.exitCode=2;
} finally { db.close(); }
