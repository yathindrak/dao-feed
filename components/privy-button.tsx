'use client';
import { usePrivy } from '@privy-io/react-auth';
import clsx from 'clsx';
import { ExitIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import {
  Identity,
  Name,
  Badge,
  Address,
  Avatar,
} from '@coinbase/onchainkit/identity';
import CustomAvatar from '@/components/avatar';

interface IButton {
  children?: React.ReactNode;
  className?: string;
}

export default function PrivyButton(props: IButton) {
  const { authenticated, login, logout, user } = usePrivy();

  const walletAddress = user?.wallet?.address || '';

  return (
    <div
      className={clsx(
        'h-20 flex-wrap md:flex p-4 items-center justify-center border-t w-full border-solid border-border',
        {
          'lg:justify-center': !authenticated,
          'lg:justify-between': authenticated,
        },
      )}
    >
      {authenticated && walletAddress && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-secondary/50 p-2 rounded-full">
            <Identity
              address={walletAddress as `0x${string}`}
              schemaId="0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9"
              className="flex items-center gap-2"
              hasCopyAddressOnClick
            >
              <Avatar
                defaultComponent={<CustomAvatar seed={walletAddress} />}
                className="mr-2"
              />
              <Name>
                <Badge tooltip="Coinbase Verified Account" />
              </Name>
              <Address />
            </Identity>
          </div>
        </div>
      )}

      <Button
        variant={authenticated ? 'destructive' : 'default'}
        size="lg"
        onClick={authenticated ? logout : login}
        className={clsx(
          'transition-all duration-200 rounded-full',
          {
            'bg-destructive/90 hover:bg-destructive': authenticated,
            'bg-gradient-to-r from-primary to-primary/80': !authenticated,
          },
          props.className,
        )}
      >
        {authenticated ? (
          <div className="flex items-center gap-2">
            <ExitIcon className="h-4 w-4" />
            <span>Disconnect</span>
          </div>
        ) : (
          <p className="font-semibold">Connect Wallet</p>
        )}
      </Button>
    </div>
  );
}
