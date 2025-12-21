import { NextRequest, NextResponse } from 'next/server';
import { CSAT_SCORES, type CsatScore, CsatSubmissionError, submitCsatResponse } from '@/lib/csat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body.token ?? '').toString().trim();
    const supportScore = (body.supportScore ?? '').toString().trim() as CsatScore;
    const productScore = (body.productScore ?? '').toString().trim() as CsatScore;
    const supportReason = typeof body.supportReason === 'string' ? body.supportReason.trim() : '';
    const productFeedback = typeof body.productFeedback === 'string' ? body.productFeedback.trim() : '';

    if (!token) {
      return NextResponse.json({ error: 'Missing survey token.' }, { status: 400 });
    }
    if (!CSAT_SCORES.includes(supportScore)) {
      return NextResponse.json({ error: 'Invalid support score.' }, { status: 400 });
    }
    if (!CSAT_SCORES.includes(productScore)) {
      return NextResponse.json({ error: 'Invalid product score.' }, { status: 400 });
    }

    const result = await submitCsatResponse({
      token,
      supportScore,
      supportReason: supportReason || null,
      productScore,
      productFeedback: productFeedback || null,
    });

    return NextResponse.json({ success: true, submittedAt: result.submittedAt.toISOString() });
  } catch (error) {
    if (error instanceof CsatSubmissionError) {
      const statusMap: Record<CsatSubmissionError['code'], number> = {
        invalid_token: 404,
        expired: 410,
        already_submitted: 409,
        server_error: 500,
      };
      return NextResponse.json({ error: error.message }, { status: statusMap[error.code] ?? 400 });
    }
    console.error('Unhandled CSAT submission error', error);
    const message = error instanceof Error && error.message ? error.message : 'Unable to submit feedback.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
