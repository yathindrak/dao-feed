import type { NextRequest } from 'next/server';
import { getChatsByUserId } from '@/lib/db/queries';
import { cookies } from 'next/headers';
import { PrivyClient } from '@privy-io/server-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get('limit') || '10');

  const cookieStore = await cookies();
  const userToken = cookieStore.get('privy-token');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!userToken || !appId || !appSecret) {
    return Response.json('Unauthorized!', { status: 401 });
  }

  try {
    const privy = new PrivyClient(appId, appSecret);
    const userClaims = await privy.verifyAuthToken(userToken.value);
    const user = { userId: userClaims.userId };

    console.log('user', user);

    const chats = await getChatsByUserId({
      id: user.userId,
      limit,
    });

    return Response.json(chats);
  } catch (error) {
    return Response.json('Failed to fetch chats!', { status: 500 });
  }
}
