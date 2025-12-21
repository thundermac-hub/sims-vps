import SupportFormClient from './SupportFormClient';
import { getSupportFormSettings } from '@/lib/support-settings';

export const dynamic = 'force-dynamic';

function buildHeroContact(settings: Awaited<ReturnType<typeof getSupportFormSettings>>): string {
  const parts: string[] = [];
  if (settings.contactPhone) {
    parts.push(`📞 ${settings.contactPhone}`);
  }
  if (settings.contactEmail) {
    parts.push(`✉️ ${settings.contactEmail}`);
  }
  return parts.join(' · ');
}

export default async function SupportFormPage() {
  const settings = await getSupportFormSettings();
  const heroContact = buildHeroContact(settings);

  return <SupportFormClient heroContact={heroContact} categoryOptions={settings.categoryOptions} />;
}
