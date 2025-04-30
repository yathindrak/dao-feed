import { Chat } from '@/components/chat';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';

export default async function Page() {
  const id = generateUUID();

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        selectedVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
