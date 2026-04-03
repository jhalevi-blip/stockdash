export const dynamic = 'force-dynamic';

import { getUsageCounts } from '@/lib/apiUsage';

export async function GET() {
  const counts = await getUsageCounts();
  return Response.json(counts, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
