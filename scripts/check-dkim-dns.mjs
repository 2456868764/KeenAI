#!/usr/bin/env node
/**
 * P1-03: check SPF / DKIM / DMARC DNS records for a sending domain.
 *
 * Usage:
 *   node scripts/check-dkim-dns.mjs --domain example.com --selector keenai
 */
import dns from "node:dns/promises";

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return null;
  return process.argv[idx + 1];
}

const domain = readArg("--domain");
const selector = readArg("--selector") ?? "default";

if (!domain) {
  console.error("usage: node scripts/check-dkim-dns.mjs --domain example.com [--selector keenai]");
  process.exit(1);
}

async function txtRecords(name) {
  try {
    const rows = await dns.resolveTxt(name);
    return rows.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

const spf = await txtRecords(domain);
const dkim = await txtRecords(`${selector}._domainkey.${domain}`);
const dmarc = await txtRecords(`_dmarc.${domain}`);

let ok = true;

const spfHit = spf.find((r) => r.toLowerCase().startsWith("v=spf1"));
if (spfHit) {
  console.log(`SPF  ok: ${spfHit.slice(0, 80)}${spfHit.length > 80 ? "…" : ""}`);
} else {
  console.error("SPF  missing on root domain");
  ok = false;
}

const dkimHit = dkim.find((r) => r.includes("v=DKIM1") || r.includes("p="));
if (dkimHit) {
  console.log(`DKIM ok: ${selector}._domainkey.${domain}`);
} else {
  console.error(`DKIM missing: ${selector}._domainkey.${domain}`);
  ok = false;
}

const dmarcHit = dmarc.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
if (dmarcHit) {
  console.log(`DMARC ok: ${dmarcHit.slice(0, 80)}${dmarcHit.length > 80 ? "…" : ""}`);
} else {
  console.error(`DMARC missing: _dmarc.${domain}`);
  ok = false;
}

if (!ok) process.exit(1);
console.log("dkim dns check passed");
