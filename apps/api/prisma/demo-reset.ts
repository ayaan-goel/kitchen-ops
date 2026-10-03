/**
 * Wipes operational data (orders, drops, invoices, adjustments, cut-off runs, demo markers,
 * delivery photos) and restarts order/invoice numbering, keeping the base seed (catalogue,
 * companies, employees, staff, settings). The API's demo generator refills the window on its next
 * run. Destructive: requires `--yes`.
 *
 *   pnpm --filter @fernleaf/api demo:reset -- --yes
 */
import { existsSync } from 'node:fs';
import { createPgAdapter } from '../src/common/prisma/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.argv.includes('--yes')) {
  console.error('This deletes every order, drop, invoice and adjustment. Re-run with --yes to confirm.');
  process.exit(1);
}
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (or DIRECT_URL) is required');
const prisma = new PrismaClient({ adapter: createPgAdapter(url, process.env.DATABASE_SCHEMA) });

async function main(): Promise<void> {
  const before = await prisma.order.count();
  await prisma.$executeRawUnsafe(
    'TRUNCATE "InvoiceLine", "Invoice", "BillingAdjustment", "OrderEvent", "OrderLineSelection", "OrderLineCombination", "OrderLine", "Order", "Drop", "CutoffRun", "DemoDay" RESTART IDENTITY',
  );
  const photos = await prisma.storedFile.deleteMany({ where: { kind: 'DELIVERY_PHOTO' } });
  console.log(`Removed ${before} orders and ${photos.count} delivery photos. Numbering restarts at FL-000001 / INV-0001.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
