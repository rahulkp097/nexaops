import { UsersPage } from '../../../../components/admin/users-page';
import { RequireAdmin } from '../../../../components/require-admin';

export default function Page() {
  return (
    <RequireAdmin>
      <UsersPage />
    </RequireAdmin>
  );
}
