import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  header: string;
  cell: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  emptyMessage?: string;
};

export default function DataTable<T>({ columns, rows, emptyMessage = "No records found." }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm shadow-slate-200/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-[0.18em] text-slate-400">
            <tr>
              {columns.map((column) => (
                <th key={column.header} className="px-5 py-4 font-bold">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
            {rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-slate-400" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="transition hover:bg-rose-50/30">
                  {columns.map((column) => (
                    <td key={column.header} className="px-5 py-4 align-middle">
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
