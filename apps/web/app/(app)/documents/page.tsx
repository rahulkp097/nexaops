import { DocumentsPage } from '../../../components/documents/documents-page';
import { RequireAdmin } from '../../../components/require-admin';

export default function Page() {
  return (
    <RequireAdmin>
      <DocumentsPage />
    </RequireAdmin>
  );
}
