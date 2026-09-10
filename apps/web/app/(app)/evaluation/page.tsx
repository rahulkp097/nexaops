import { EvaluationPage } from '../../../components/evaluation/evaluation-page';
import { RequireAdmin } from '../../../components/require-admin';

export default function Page() {
  return (
    <RequireAdmin>
      <EvaluationPage />
    </RequireAdmin>
  );
}
