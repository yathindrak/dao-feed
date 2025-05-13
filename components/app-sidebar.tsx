'use client';

import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { PlusIcon, BarChartIcon, DashboardIcon } from '@radix-ui/react-icons';

import { SidebarHistory } from '@/components/sidebar-history';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function AppSidebar() {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { authenticated, login, user } = usePrivy();

  const handleNewChat = () => {
    setOpenMobile(false);
    if (!authenticated) {
      login();
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <Sidebar className="group-data-[side=left]:border-r-1 border">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row justify-between items-center">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className="flex flex-row gap-3 items-center"
            >
              <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
                DAO Feed
              </span>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  type="button"
                  className="p-2 h-fit"
                  onClick={handleNewChat}
                >
                  <PlusIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent align="end">New Chat</TooltipContent>
            </Tooltip>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {authenticated && user && <SidebarHistory user={user} />}

        <div className="mt-4 px-2">
          <div className="text-xs text-gray-500 font-medium mb-2 px-2">
            DAO Governance
          </div>
          <nav className="space-y-1">
            <Link
              href="/leaderboard"
              onClick={() => setOpenMobile(false)}
              className="flex items-center px-3 py-2 text-sm rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <BarChartIcon className="mr-2 h-4 w-4" />
              Live Leaderboard
            </Link>
            {authenticated && user && (
              <Link
                href="/claim"
                onClick={() => setOpenMobile(false)}
                className="flex items-center px-3 py-2 text-sm rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              >
                <DashboardIcon className="mr-2 h-4 w-4" />
                Claim Rewards
              </Link>
            )}
          </nav>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
