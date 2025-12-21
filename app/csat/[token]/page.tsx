import CsatSurveyContent from '../CsatSurveyContent';
import styles from '../survey.module.css';
import { getCsatInviteByToken } from '@/lib/csat';

export const dynamic = 'force-dynamic';

interface CsatSurveyPageProps {
  params: Promise<{ token: string }>;
}

export default async function CsatSurveyPage({ params }: CsatSurveyPageProps) {
  const resolvedParams = await params;
  const token = typeof resolvedParams?.token === 'string' ? resolvedParams.token : '';
  const invite = await getCsatInviteByToken(token);
  const isExpired = invite?.isExpired ?? false;
  const alreadySubmitted = Boolean(invite?.submittedAt);
  const merchantName = invite?.merchantName || 'Valued Customer';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <CsatSurveyContent
          token={token}
          merchantName={merchantName}
          isExpired={isExpired}
          alreadySubmitted={alreadySubmitted}
          inviteAvailable={Boolean(invite)}
        />
      </div>
    </div>
  );
}
