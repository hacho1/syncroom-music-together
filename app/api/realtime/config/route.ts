export async function GET() {
  return Response.json({
    socketUrl: process.env.SOCKET_SERVER_URL?.trim() || null,
    fallback: 'polling',
  });
}
