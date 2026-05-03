import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface Props {
  variables: string[];
}

export default function VariableChipList({ variables }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!variables || variables.length === 0) {
    return <div className="text-xs text-slate-500">Pa variabla.</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {variables.map((v) => {
        const token = `{{${v}}}`;
        const isCopied = copied === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(token).catch(() => {});
              setCopied(v);
              setTimeout(() => setCopied((c) => (c === v ? null : c)), 1200);
            }}
            className="group inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
          >
            <code className="font-mono text-[11px]">{token}</code>
            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />}
          </button>
        );
      })}
    </div>
  );
}
