import Image from 'next/image';

const imageProps = {
  width: 64,
  height: 64,
  className: 'rounded-full h-4 w-4',
};

const toolInfo = {
  // Moralis
  get_token_balances: {
    loading: 'Getting token balances...',
    title: 'Fetched token balances',
    icon: <Image src="/moralis.png" alt="Moralis" {...imageProps} />,
  },
} as const;

export const getToolInfo = (toolName: string) => {
  if (toolName in toolInfo) {
    return toolInfo[toolName as keyof typeof toolInfo];
  }
  return null;
};
