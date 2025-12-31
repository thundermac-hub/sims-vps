import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "./users.module.css";
import { env } from "@/lib/env";
import {
  CreateUserInput,
  UpdateUserInput,
  createUser,
  getUserById,
  listUsers,
  updateUser,
} from "@/lib/users";
import EditUserModal from "./EditUserModal";
import AddUserModal from "./AddUserModal";
import { getAuthenticatedUser } from "@/lib/auth-user";
import { getDepartmentDisplayName } from "@/lib/branding";

export const dynamic = "force-dynamic";

const DEPARTMENT_OPTIONS = [
  "Merchant Success",
  "Sales & Marketing",
  "Operation",
  "Product & Engineering",
];
const ROLE_OPTIONS = ["Super Admin", "Admin", "User"];
const ADMIN_ROLE_OPTIONS = ["Admin", "User"];

async function assertPrivilegedUser() {
  const authUser = await getAuthenticatedUser();
  if (!authUser.canManageUsers) {
    throw new Error("You do not have permission to manage users.");
  }
  return authUser;
}

async function createUserAction(formData: FormData) {
  "use server";
  const authUser = await assertPrivilegedUser();

  const payload: CreateUserInput = {
    email: (formData.get("email") ?? "").toString().trim(),
    password: (formData.get("password") ?? "").toString(),
    name: (formData.get("name") ?? "").toString().trim() || null,
    department: (formData.get("department") ?? "").toString().trim() || null,
    role: (formData.get("role") ?? "").toString().trim() || null,
  };

  if (!payload.email) {
    throw new Error("Email is required.");
  }
  if (!payload.password) {
    throw new Error("Password is required.");
  }
  if (!authUser.isSuperAdmin) {
    payload.department = authUser.department ?? payload.department;
  }
  if (!payload.department) {
    throw new Error("Department is required.");
  }
  if (!authUser.isSuperAdmin) {
    if (!payload.role || !ADMIN_ROLE_OPTIONS.includes(payload.role)) {
      payload.role = ADMIN_ROLE_OPTIONS[0];
    }
  }

  await createUser(payload);
  revalidatePath("/users");
}

async function updateUserAction(formData: FormData) {
  "use server";
  const authUser = await assertPrivilegedUser();
  const userId = Number(formData.get("id"));

  if (!Number.isFinite(userId)) {
    throw new Error("Invalid user identifier.");
  }

  const email = (formData.get("email") ?? "").toString().trim();
  if (!email) {
    throw new Error("Email cannot be empty.");
  }

  const targetUser = await getUserById(userId, { includeInactive: true });
  if (!targetUser) {
    throw new Error("User not found.");
  }

  const submittedDepartment = (formData.get("department") ?? "").toString().trim() || null;
  const submittedRole = (formData.get("role") ?? "").toString().trim() || null;

  const updatePayload: UpdateUserInput = {
    email,
    name: (formData.get("name") ?? "").toString().trim() || null,
    department: submittedDepartment,
    role: submittedRole,
  };

  const password = (formData.get("password") ?? "").toString();
  if (password) {
    updatePayload.password = password;
  }
  if (!authUser.isSuperAdmin) {
    updatePayload.department = authUser.department ?? targetUser.department ?? null;
    if (targetUser.department && authUser.department && targetUser.department !== authUser.department) {
      throw new Error("You cannot modify users outside your department.");
    }
    const isSelf = authUser.id === targetUser.id;
    if (isSelf) {
      updatePayload.role = targetUser.role ?? ADMIN_ROLE_OPTIONS[0];
    } else {
      updatePayload.role = ADMIN_ROLE_OPTIONS.includes(submittedRole ?? "")
        ? submittedRole
        : targetUser.role ?? ADMIN_ROLE_OPTIONS[0];
    }
  } else {
    updatePayload.role = submittedRole || targetUser.role || "Admin";
  }

  await updateUser(userId, updatePayload);
  revalidatePath("/users");

  // If the current user updated their own email or role, refresh the page state.
  if (authUser.id === userId) {
    revalidatePath("/", "layout");
  }
}

export default async function UsersPage() {
  const authUser = await getAuthenticatedUser();
  if (!authUser.canManageUsers) {
    redirect("/profile");
  }

  const users = await listUsers();
  const visibleUsers = authUser.isSuperAdmin
    ? users
    : users.filter((user) => user.department === authUser.department);
  const userCreatedFormatter = new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: env.timezone,
  });
  const departmentName = getDepartmentDisplayName(authUser.department);
  const heroSubtitle = authUser.isSuperAdmin
    ? "Manage access for every department, invite admins, or update roles from one place."
    : `Manage ${departmentName} teammates and keep access up to date.`;
  const addUserCtaLabel = authUser.isSuperAdmin ? "Add User" : `Add ${departmentName} User`;
  const addUserModalTitle = authUser.isSuperAdmin ? "Add New User" : `Add ${departmentName} User`;
  const addUserModalSubtitle = authUser.isSuperAdmin
    ? "Create accounts for any department with secure credentials."
    : `Invite a new ${departmentName} teammate and assign their role.`;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>User Management</h1>
            <p className={styles.heroSubtitle}>{heroSubtitle}</p>
          </div>
          <div className={styles.heroActions}>
            <AddUserModal
              onCreate={createUserAction}
              ctaLabel={addUserCtaLabel}
              modalTitle={addUserModalTitle}
              modalSubtitle={addUserModalSubtitle}
              departmentOptions={DEPARTMENT_OPTIONS}
              roleOptions={ROLE_OPTIONS}
              adminRoleOptions={ADMIN_ROLE_OPTIONS}
              isSuperAdmin={authUser.isSuperAdmin}
              fixedDepartment={authUser.department ?? null}
            />
          </div>
        </div>
      </header>

      <section className={styles.usersTableCard}>
        <div className={styles.usersTableHeader}>
          <h2>Users</h2>
          <span>{visibleUsers.length} total</span>
        </div>
        {visibleUsers.length === 0 ? (
          <div className={styles.emptyState}>No users found. Use the Add User button above to invite a teammate.</div>
        ) : (
          <div className={styles.usersTableWrapper}>
            <table className={styles.usersTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const statusActionDisabled = authUser.id === user.id;
                  const createdDisplay = user.created_at
                    ? userCreatedFormatter.format(new Date(user.created_at))
                    : "—";
                  return (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.stackedCell}>
                          <span className={styles.primaryText}>{user.name ?? "—"}</span>
                          <span className={styles.secondaryText}>ID #{user.id}</span>
                          {!user.is_active ? <span className={styles.inactiveBadge}>Inactive</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className={styles.userEmail}>{user.email}</span>
                      </td>
                      <td>
                        <span>{user.department ?? "—"}</span>
                      </td>
                      <td>
                        <span>{user.role ?? "—"}</span>
                      </td>
                      <td className={styles.userCreated}>{createdDisplay}</td>
                      <td>
                        <EditUserModal
                          user={user}
                          timezone={env.timezone}
                          updateAction={updateUserAction}
                          statusActionDisabled={statusActionDisabled}
                          departmentOptions={DEPARTMENT_OPTIONS}
                          roleOptions={ROLE_OPTIONS}
                          adminRoleOptions={ADMIN_ROLE_OPTIONS}
                          isSuperAdmin={authUser.isSuperAdmin}
                          fixedDepartment={authUser.department ?? null}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
