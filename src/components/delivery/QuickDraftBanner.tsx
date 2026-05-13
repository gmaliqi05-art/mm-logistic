import { FileScan, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  count: number;
}

export default function QuickDraftBanner({ count }: Props) {
  if (count === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900">
            Ke {count} porosi qe presin skanim
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            Kompania te ka caktuar dokumente fizike. Skano dokumentin per t'i plotesuar.
          </p>
          <Link
            to="/driver/dashboard?filter=quick_draft"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            <FileScan className="h-4 w-4" />
            Skano tani
          </Link>
        </div>
      </div>
    </div>
  );
}
