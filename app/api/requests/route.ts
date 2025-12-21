import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  buildWhatsAppUrl,
  createSupportRequest,
  normalisePhone,
} from '@/lib/requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function badRequest(body: Record<string, unknown>) {
  return NextResponse.json(body, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const merchantName = (formData.get('merchant_name') ?? '').toString().trim();
    const outletName = (formData.get('outlet_name') ?? '').toString().trim();
    const phoneNumberRaw = (formData.get('phone_number') ?? '').toString().trim();
    const emailInput = (formData.get('email') ?? '').toString().trim();
    const fid = (formData.get('fid') ?? '').toString().trim();
    const oid = (formData.get('oid') ?? '').toString().trim();
    const issueType = (formData.get('issue_type') ?? '').toString().trim();
    const issueSubcategory1 = (formData.get('issue_subcategory1') ?? '').toString().trim();
    const issueSubcategory2 = (formData.get('issue_subcategory2') ?? '').toString().trim();
    const issueDescription = (formData.get('issue_description') ?? '').toString().trim();
    const readAttachment = (field: string) => {
      const value = formData.get(field);
      return value instanceof File && value.size > 0 ? value : null;
    };
    const attachments = [
      readAttachment('attachment'),
      readAttachment('attachment_receipt'),
      readAttachment('attachment_other'),
    ];

    const errors: string[] = [];
    if (!merchantName) errors.push('Merchant Name is required');
    if (!phoneNumberRaw) errors.push('Phone Number is required');
    if (!issueType) errors.push('Category is required');
    if (!issueSubcategory1) errors.push('Subcategory 1 is required');
    if (!issueDescription) errors.push('Issue Description is required');
    if (!fid) errors.push('FID is required');
    if (!oid) errors.push('OID is required');

    if (fid && !/^\d{1,4}$/.test(fid)) {
      errors.push('FID must be 1-4 digits');
    }
    if (oid && !/^\d{1,2}$/.test(oid)) {
      errors.push('OID must be 1-2 digits');
    }

    const normalisedPhone = normalisePhone(phoneNumberRaw);
    if (!normalisedPhone) {
      errors.push('Phone Number must contain digits');
    }

    if (errors.length > 0) {
      return badRequest({ errors });
    }

    const email = emailInput !== '' ? emailInput : null;
    const outletNameValue = outletName || 'N/A';

    const { id } = await createSupportRequest({
      merchantName,
      outletName: outletNameValue,
      phoneNumber: normalisedPhone,
      email,
      fid,
      oid,
      issueType,
      issueSubcategory1,
      issueSubcategory2: issueSubcategory2 || null,
      issueDescription,
      attachments,
    });

    const whatsappUrl = buildWhatsAppUrl({
      merchantName,
      outletName: outletNameValue,
      phoneNumber: normalisedPhone,
      email,
      fid,
      oid,
      issueType,
      issueSubcategory1,
      issueSubcategory2: issueSubcategory2 || null,
      issueDescription,
      requestId: id,
    });

    revalidatePath('/tickets');

    return NextResponse.json(
      {
        id,
        whatsappUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported file type') {
      return badRequest({ error: error.message });
    }
    if (error instanceof Error && error.message === 'File exceeds maximum allowed size') {
      return badRequest({ error: error.message });
    }
    console.error('Create request error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
