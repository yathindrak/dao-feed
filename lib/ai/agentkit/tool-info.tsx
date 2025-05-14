import Image from 'next/image';

const imageProps = {
  width: 64,
  height: 64,
  className: 'rounded-full h-4 w-4',
};

const toolInfo = {
  get_created_proposals: {
    loading: 'Fetching new proposals...',
    title: 'New Proposals',
    icon: <Image src="/snapshot.svg" alt="Snapshot" {...imageProps} />,
  },
  get_new_unaddressed_proposals: {
    loading: 'Fetching unaddressed proposals...',
    title: 'New & Unaddressed Proposals',
    icon: <Image src="/snapshot.svg" alt="Snapshot" {...imageProps} />,
  },
  get_addressed_proposals: {
    loading: 'Fetching addressed proposals...',
    title: 'Addressed Proposals',
    icon: <Image src="/snapshot.svg" alt="Snapshot" {...imageProps} />,
  },
} as const;

export const getToolInfo = (toolName: string) => {
  if (toolName in toolInfo) {
    return toolInfo[toolName as keyof typeof toolInfo];
  }
  return null;
};
