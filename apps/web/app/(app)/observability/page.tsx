import { ObservabilityPage } from '../../../components/observability/observability-page';
import { RequireAdmin } from '../../../components/require-admin';

export default function Page() {
  return (
    <RequireAdmin>
      <ObservabilityPage />
    </RequireAdmin>
  );
}
