import { getSupabaseAdminClient } from './db';

export interface IssueSubcategoryLevel {
  name: string;
  subcategories: string[];
}

export interface IssueCategoryConfig {
  category: string;
  subcategories: IssueSubcategoryLevel[];
}

export interface SupportFormSettings {
  contactPhone: string | null;
  contactEmail: string | null;
  categoryOptions: IssueCategoryConfig[];
}

export const DEFAULT_CATEGORY_OPTIONS: IssueCategoryConfig[] = [
  {
    category: 'General',
    subcategories: [
      { name: 'General Inquiry', subcategories: [] },
      { name: 'Renewal', subcategories: [] },
      { name: 'How To Question', subcategories: [] },
    ],
  },
  {
    category: 'Hardware',
    subcategories: [
      {
        name: 'Printer',
        subcategories: ['Setup / Add New', 'Connection Issue', 'Printing Issue', 'Others'],
      },
      {
        name: 'Router',
        subcategories: ['Setup', 'Internet Issue', 'Connection Issue', 'Other Issue'],
      },
      { name: 'Cash Drawer', subcategories: ['Jammed', 'Lost Key'] },
      {
        name: 'iPad',
        subcategories: [
          'Power & Battery Issue',
          'Connectivity Problems',
          'Performance Issues',
          'Display Problems',
          'Software & OS Issues',
          'Account & Security Issue',
          'Lost or Stolen Device',
        ],
      },
      { name: 'Other', subcategories: [] },
    ],
  },
  {
    category: 'Slurp Central',
    subcategories: [
      { name: 'Settings', subcategories: [] },
      { name: 'Connection Issue', subcategories: [] },
      { name: 'How To Question', subcategories: [] },
    ],
  },
  {
    category: 'Slurp CDS',
    subcategories: [
      {
        name: 'Android',
        subcategories: ['Connection Issue', 'Sync Issue', 'Missing Application', 'Hardware Malfunction', 'Others'],
      },
      {
        name: 'iOS',
        subcategories: ['Connection Issue', 'Sync Issue', 'Missing Application', 'Hardware Malfunction', 'Others'],
      },
    ],
  },
  {
    category: 'Slurp KDS',
    subcategories: [
      { name: 'Connection Issue', subcategories: [] },
      { name: 'Sync Issue', subcategories: [] },
      { name: 'Missing Application', subcategories: [] },
      { name: 'Hardware Malfunction', subcategories: [] },
      { name: 'Others', subcategories: [] },
    ],
  },
  {
    category: 'Slurp Waiter',
    subcategories: [
      {
        name: 'Android',
        subcategories: [
          'Connection Issue',
          'Sync Issue',
          'Printing Issue',
          'Missing Application',
          'Hardware Malfunction',
          'Others',
        ],
      },
      {
        name: 'iOS',
        subcategories: [
          'Connection Issue',
          'Sync Issue',
          'Printing Issue',
          'Missing Application',
          'Hardware Malfunction',
          'Others',
        ],
      },
    ],
  },
  {
    category: 'Slurp Cloud',
    subcategories: [
      { name: 'Login & Account Issue', subcategories: [] },
      { name: 'Reports', subcategories: [] },
      { name: 'Products', subcategories: [] },
      { name: 'Payment Method', subcategories: [] },
    ],
  },
  {
    category: 'GetOrders',
    subcategories: [
      {
        name: 'Cloud GetOrders',
        subcategories: ['Login & Account Issue', 'Syncing Issue', 'Betterpay'],
      },
      { name: 'Shoplink', subcategories: ['Loading Issue', 'Product Issue', 'Payment Issue'] },
      { name: 'Static QR', subcategories: ['Loading Issue', 'Product Issue', 'Payment Issue'] },
      {
        name: 'Dynamic QR',
        subcategories: ['Loading Issue', 'Product Issue', 'Payment Issue', 'Service Not Connected'],
      },
    ],
  },
  {
    category: 'Payment',
    subcategories: [
      { name: 'Billing Issue', subcategories: [] },
      { name: 'Online Payment Issue', subcategories: [] },
    ],
  },
];

export const DEFAULT_SUPPORT_FORM_SETTINGS: SupportFormSettings = {
  contactPhone: '+60 11-5665 4761',
  contactEmail: 'support@getslurp.com',
  categoryOptions: DEFAULT_CATEGORY_OPTIONS,
};

function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCategoryOptions(input: unknown): IssueCategoryConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const result: IssueCategoryConfig[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const category = sanitizeString((entry as Record<string, unknown>).category);
    if (!category) {
      continue;
    }
    const subcategoriesRaw = (entry as Record<string, unknown>).subcategories;
    if (!Array.isArray(subcategoriesRaw)) {
      result.push({ category, subcategories: [] });
      continue;
    }
    const subcategories: IssueSubcategoryLevel[] = [];
    for (const sub of subcategoriesRaw) {
      if (!sub || typeof sub !== 'object') {
        continue;
      }
      const name = sanitizeString((sub as Record<string, unknown>).name);
      if (!name) {
        continue;
      }
      const optionsRaw = (sub as Record<string, unknown>).subcategories;
      const options = Array.isArray(optionsRaw)
        ? optionsRaw.map((value) => (typeof value === 'string' ? value.trim() : null)).filter(Boolean) as string[]
        : [];
      subcategories.push({ name, subcategories: options });
    }
    result.push({ category, subcategories });
  }
  return result;
}

function parseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getSupportFormSettings(): Promise<SupportFormSettings> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('support_form_settings')
    .select('contact_phone, contact_email, category_config, issue_types')
    .eq('id', 1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (!data) {
    return { ...DEFAULT_SUPPORT_FORM_SETTINGS };
  }

  const contactPhone = sanitizeString((data as Record<string, unknown>).contact_phone);
  const contactEmail = sanitizeString((data as Record<string, unknown>).contact_email);
  const rawCategory = parseJsonArray((data as Record<string, unknown>).category_config);
  const categoryConfig = sanitizeCategoryOptions(rawCategory ?? (data as Record<string, unknown>).category_config);

  return {
    contactPhone: contactPhone ?? DEFAULT_SUPPORT_FORM_SETTINGS.contactPhone,
    contactEmail: contactEmail ?? DEFAULT_SUPPORT_FORM_SETTINGS.contactEmail,
    categoryOptions: categoryConfig.length > 0 ? categoryConfig : DEFAULT_SUPPORT_FORM_SETTINGS.categoryOptions,
  };
}

export type UpdateSupportFormSettingsInput = SupportFormSettings;

export async function updateSupportFormSettings(
  input: UpdateSupportFormSettingsInput,
  updatedBy: string | null = null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    id: 1,
    contact_phone: sanitizeString(input.contactPhone) ?? null,
    contact_email: sanitizeString(input.contactEmail) ?? null,
    category_config: Array.isArray(input.categoryOptions) && input.categoryOptions.length > 0
      ? input.categoryOptions
      : DEFAULT_SUPPORT_FORM_SETTINGS.categoryOptions,
    issue_types: (Array.isArray(input.categoryOptions) && input.categoryOptions.length > 0
      ? input.categoryOptions
      : DEFAULT_SUPPORT_FORM_SETTINGS.categoryOptions
    ).map((option) => option.category),
    updated_by: updatedBy ?? null,
  };

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('support_form_settings').upsert(payload, {
    onConflict: 'id',
  });

  if (error) {
    throw error;
  }
}
