import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** Contenedor de tabla del DS: borde, radios amplios y scroll horizontal propio. */
export function Table({ className = "", children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="ds-scroll overflow-x-auto rounded-lg border border-line bg-surface">
      <table className={`w-full border-collapse text-left ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`bg-surface-2 px-[22px] py-3.5 text-xs font-semibold uppercase tracking-wider text-muted ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`border-t border-line px-[22px] py-4 align-middle text-sm ${className}`} {...props} />
  );
}
