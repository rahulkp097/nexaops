'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui';

interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/documents', label: 'Documents', adminOnly: true },
  { href: '/admin/users', label: 'Users', adminOnly: true },
  { href: '/evaluation', label: 'Evaluation', adminOnly: true },
  { href: '/observability', label: 'Observability', adminOnly: true },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'ADMIN');

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
      <div className="border-b border-neutral-200 px-4 py-4">
        <span className="text-lg font-semibold">NexaOps</span>
      </div>
      <ul className="flex-1 space-y-1 p-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm ${
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-neutral-200 p-3">
        <p className="truncate text-xs text-neutral-500" title={user?.email}>
          {user?.email}
        </p>
        <p className="mb-2 text-xs text-neutral-400">{user?.role}</p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            await logout();
            router.push('/login');
          }}
        >
          Log out
        </Button>
      </div>
    </nav>
  );
}
