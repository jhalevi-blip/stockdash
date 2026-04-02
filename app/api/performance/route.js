export async function GET() {
  return Response.json({ error: 'Performance data not available' }, { status: 404 });
}
