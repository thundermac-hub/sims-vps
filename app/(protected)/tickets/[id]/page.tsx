import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/auth-user';
import { canAccessTicketsPages } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export default async function TicketDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const authUser = await getAuthenticatedUser();
  if (!canAccessTicketsPages(authUser.department, authUser.isSuperAdmin)) {
    redirect('/profile');
  }

  const resolvedParams = await params;
  const idValue = Number(resolvedParams.id);
  if (!Number.isFinite(idValue) || idValue <= 0) {
    notFound();
  }

  redirect(`/merchants/tickets/${idValue}`);
}
