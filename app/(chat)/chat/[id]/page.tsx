import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import type { DBMessage } from '@/lib/db/schema';
import type { UIMessage } from 'ai';
import { PrivyClient } from '@privy-io/server-auth';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  let user: { userId: string } | undefined;
  const cookieStore = await cookies();
  const userToken = cookieStore.get('privy-token');
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (userToken && appId && appSecret) {
    try {
      const privy = new PrivyClient(appId, appSecret);
      const userClaims = await privy.verifyAuthToken(userToken.value);
      user = { userId: userClaims.userId };
    } catch (error) {
      // User is not authenticated
      console.error('Privy authentication error:', error);
    }
  }

  console.log({ id, chat, user });

  if (chat.visibility === 'private') {
    if (!user?.userId) {
      return notFound();
    }

    if (user.userId !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  function convertToUIMessages(messages: Array<DBMessage>): Array<UIMessage> {
    return messages.map((message) => ({
      id: message.id,
      parts: message.parts as UIMessage['parts'],
      role: message.role as UIMessage['role'],
      // Note: content will soon be deprecated in @ai-sdk/react
      content: '',
      createdAt: message.createdAt,
    }));
  }

  const chatModelFromCookie = cookieStore.get('chat-model');

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={convertToUIMessages(messagesFromDb)}
          selectedVisibilityType={chat.visibility}
          isReadonly={user?.userId !== chat.userId}
        />
        <DataStreamHandler id={id} />
      </>
    );
  }

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={convertToUIMessages(messagesFromDb)}
        selectedVisibilityType={chat.visibility}
        isReadonly={user?.userId !== chat.userId}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
