'use client';
import { usePrivy } from '@privy-io/react-auth';
import clsx from 'clsx';
import { ExitIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';

interface IButton {
  children?: React.ReactNode;
  className?: string;
}

export default function PrivyButton(props: IButton) {
  const { authenticated, login, logout, user } = usePrivy();
  return (
    <div
      className={clsx(
        'h-20 flex-wrap md:flex p-4 hidden items-center justify-center border-t w-full border-solid border-border',
        {
          'lg:justify-center': !authenticated,
          'lg:justify-between': authenticated,
        },
      )}
    >
      <div
        className={clsx('text-sm flex items-center gap-2', {
          hidden: !authenticated,
          block: authenticated,
        })}
      >
        {authenticated
          ? user?.wallet?.address
              .slice(0, 6)
              .concat('..', user.wallet.address.slice(-5, -1).toUpperCase())
          : ''}
        <div className="w-[6px] h-[6px] rounded-full bg-primary" />
      </div>
      <Button
        variant={authenticated ? 'outline' : 'default'}
        size="sm"
        onClick={authenticated ? logout : login}
        className={clsx(
          'border p-2 text-sm border-solid border-border'.concat(
            ' ',
            props.className as string,
          ),
          {
            'border-primary rounded': authenticated,
            'rounded-full py-2 px-4': !authenticated,
          },
        )}
      >
        {authenticated ? (
          <div className="text-[1.3rem]">
            <ExitIcon />
          </div>
        ) : (
          <p className="text-sm">Log in with Privy</p>
        )}
      </Button>
    </div>
  );
}
