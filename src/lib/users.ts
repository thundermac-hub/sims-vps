import { getSupabaseAdminClient } from './db';
import { hashPassword } from './password';

export type UserRole = 'Super Admin' | 'Admin' | string;

const PRIVILEGED_ROLE_SET = new Set(['super admin', 'admin']);

export function isPrivilegedRole(role: UserRole | null | undefined): boolean {
  if (!role) {
    return false;
  }
  return PRIVILEGED_ROLE_SET.has(role.trim().toLowerCase());
}

export interface ManagedUser {
  id: number;
  email: string;
  name: string | null;
  department: string | null;
  role: UserRole | null;
  created_at: string;
}

export interface MsPicUser {
  id: number;
  email: string;
  name: string | null;
  department: string | null;
  role: UserRole | null;
}

export interface UserAuthRecord {
  id: number;
  email: string;
  name: string | null;
  department: string | null;
  role: UserRole | null;
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string | null;
  department?: string | null;
  role?: UserRole | null;
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  name?: string | null;
  department?: string | null;
  role?: UserRole | null;
}

type UserRow = {
  id: number;
  email: string;
  name: string | null;
  department: string | null;
  role: UserRole | null;
  created_at?: string;
  password_hash?: string | null;
};

function mapManagedUser(row: UserRow): ManagedUser {
  return {
    id: Number(row.id),
    email: String(row.email ?? ''),
    name: (row.name ?? null) as string | null,
    department: (row.department ?? null) as string | null,
    role: (row.role ?? null) as UserRole | null,
    created_at: String(row.created_at ?? ''),
  };
}

export async function listUsers(): Promise<ManagedUser[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<UserRow>('users')
    .select('id, email, name, department, role, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  const rows: UserRow[] = Array.isArray(data) ? data : [data];
  return rows.map((row) => mapManagedUser(row));
}

export async function listMerchantSuccessUsers(): Promise<MsPicUser[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<UserRow>('users')
    .select('id, email, name, department, role')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  if (!data) {
    return [];
  }

  const rows: UserRow[] = Array.isArray(data) ? data : [data];
  return rows.map((row) => ({
      id: Number(row.id),
      email: String(row.email ?? ''),
      name: (row.name ?? null) as string | null,
      department: (row.department ?? null) as string | null,
      role: (row.role ?? null) as UserRole | null,
    }))
    .filter((user) => {
      const role = user.role?.trim().toLowerCase() ?? '';
      const department = user.department?.trim().toLowerCase() ?? '';
      return role === 'user' && department.includes('merchant success');
    });
}

export async function getUserByEmail(email: string): Promise<ManagedUser | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<UserRow>('users')
    .select('id, email, name, department, role, created_at')
    .eq('email', normalised)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapManagedUser(data as UserRow);
}

export async function getUserById(id: number): Promise<ManagedUser | null> {
  if (!Number.isFinite(id)) {
    return null;
  }
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<UserRow>('users')
    .select('id, email, name, department, role, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapManagedUser(data as UserRow);
}

export async function getUserAuthRecord(email: string): Promise<UserAuthRecord | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from<UserRow>('users')
    .select('id, email, name, department, role, password_hash')
    .eq('email', normalised)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const record = data as UserRow;
  return {
    id: Number(record.id),
    email: String(record.email ?? ''),
    name: (record.name ?? null) as string | null,
    department: (record.department ?? null) as string | null,
    role: (record.role ?? null) as UserRole | null,
    passwordHash: String(record.password_hash ?? ''),
  };
}

export async function createUser(input: CreateUserInput): Promise<ManagedUser> {
  const supabase = getSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new Error('Email is required');
  }
  if (!input.password) {
    throw new Error('Password is required');
  }

  const payload = {
    email,
    password_hash: hashPassword(input.password),
    name: input.name?.trim() || null,
    department: input.department?.trim() || null,
    role: input.role?.toString() ?? null,
  };

  const { data, error } = await supabase
    .from<UserRow>('users')
    .insert(payload)
    .select('id, email, name, department, role, created_at')
    .single();

  if (error) {
    throw error;
  }

  return mapManagedUser(data as UserRow);
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<ManagedUser> {
  const supabase = getSupabaseAdminClient();
  if (!id) {
    throw new Error('User id is required');
  }

  const payload: Record<string, unknown> = {};
  if (typeof input.email === 'string') {
    payload.email = input.email.trim().toLowerCase();
  }
  if (typeof input.name !== 'undefined') {
    payload.name = input.name?.trim() || null;
  }
  if (typeof input.department !== 'undefined') {
    payload.department = input.department?.trim() || null;
  }
  if (typeof input.role !== 'undefined') {
    payload.role = input.role?.toString() ?? null;
  }
  if (input.password) {
    payload.password_hash = hashPassword(input.password);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error('No updates provided');
  }

  const { data, error } = await supabase
    .from<UserRow>('users')
    .update(payload)
    .eq('id', id)
    .select('id, email, name, department, role, created_at')
    .single();

  if (error) {
    throw error;
  }

  return mapManagedUser(data as UserRow);
}

export async function deleteUser(id: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('users').delete().eq('id', id);
  if (error) {
    throw error;
  }
}
