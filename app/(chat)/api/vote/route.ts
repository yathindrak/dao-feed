import { cookies } from 'next/headers';
import { PrivyClient } from '@privy-io/server-auth';
import { getChatById, getVotesByChatId, voteMessage } from '@/lib/db/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('chatId is required', { status: 400 });
  }

  const cookieStore = await cookies();
  const userToken = cookieStore.get('privy-token');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!userToken || !appId || !appSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const privy = new PrivyClient(appId, appSecret);
    const userClaims = await privy.verifyAuthToken(userToken.value);
    const user = { userId: userClaims.userId };

    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== user.userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const votes = await getVotesByChatId({ id: chatId });

    return Response.json(votes, { status: 200 });
  } catch (error) {
    return new Response('Unauthorized', { status: 401 });
  }
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: 'up' | 'down' } =
    await request.json();

  if (!chatId || !messageId || !type) {
    return new Response('messageId and type are required', { status: 400 });
  }

  const cookieStore = await cookies();
  const userToken = cookieStore.get('privy-token');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!userToken || !appId || !appSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const privy = new PrivyClient(appId, appSecret);
    const userClaims = await privy.verifyAuthToken(userToken.value);
    const user = { userId: userClaims.userId };

    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== user.userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    await voteMessage({
      chatId,
      messageId,
      type: type,
    });

    return new Response('Message voted', { status: 200 });
  } catch (error) {
    return new Response('Unauthorized', { status: 401 });
  }
}
