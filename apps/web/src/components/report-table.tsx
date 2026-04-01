"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle
} from "lucide-react";

import type { ExportFormat, ReportTable as ReportTablePayload } from "@personal-ai/shared";

interface ReportTableProps {
  table: ReportTablePayload | null;
  loading?: boolean;
  exportLoading?: ExportFormat | null;
  onExport: (format: ExportFormat) => void;
}

const pageSize = 8;

const stringifyValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyValue(entry)).join(" | ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const flattenListItems = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenListItems(entry)).filter(Boolean);
  }

  const text = stringifyValue(value).trim();
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n+/)
    .map((entry) => entry.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter(Boolean);
};

const renderPreview = (value: unknown, expanded: boolean) => {
  if (Array.isArray(value)) {
    const items = flattenListItems(value);
    const visibleItems = expanded ? items : items.slice(0, 2);
    return (
      <div className="space-y-2">
        {visibleItems.length ? (
          <ol className="table-list">
            {visibleItems.map((item, index) => (
              <li key={`${item}-${index}`} className="table-list-item">
                {item}
              </li>
            ))}
          </ol>
        ) : (
          <span className="text-ink/35">-</span>
        )}
        {!expanded && items.length > 2 ? (
          <span className="text-xs text-ink/45">+{items.length - 2} more</span>
        ) : null}
      </div>
    );
  }

  const text = stringifyValue(value);
  if (!text) {
    return <span className="text-ink/35">-</span>;
  }

  if (expanded || text.length <= 120) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  return <span>{`${text.slice(0, 120)}...`}</span>;
};

export const ReportTable = ({
  table,
  loading = false,
  exportLoading,
  onExport
}: ReportTableProps) => {
  const [sortKey, setSortKey] = useState<string>();
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPage(1);
    setExpandedCells({});
    setSortKey(undefined);
    setSortDirection("asc");
  }, [table?.generatedAt]);

  const sortedRows = useMemo(() => {
    if (!table) {
      return [];
    }

    const rows = [...table.rows];
    if (!sortKey) {
      return rows;
    }

    return rows.sort((left, right) => {
      const leftValue = stringifyValue(left[sortKey]);
      const rightValue = stringifyValue(right[sortKey]);
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base"
      });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [sortDirection, sortKey, table]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <div className="surface-panel flex min-h-[24rem] items-center justify-center rounded-[2rem]">
        <div className="flex items-center gap-3 text-ink/60">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Loading table...
        </div>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="surface-panel flex min-h-[24rem] items-center justify-center rounded-[2rem] text-ink/55">
        No report loaded yet.
      </div>
    );
  }

  return (
    <section className="surface-panel halo-panel rounded-[2.15rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-2xl font-semibold text-ink">{table.title}</p>
          {table.subtitle ? <p className="mt-1 text-sm text-ink/58">{table.subtitle}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(table.appliedFilters).map(([label, value]) => (
              <span key={label} className="soft-chip rounded-full px-3 py-1 text-xs">
                {label}: {value}
              </span>
            ))}
            <span className="soft-chip rounded-full px-3 py-1 text-xs">
              {sortedRows.length} row{sortedRows.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onExport("csv")}
            className="button-secondary !px-4 !py-2 text-sm"
          >
            {exportLoading === "csv" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            CSV
          </button>
          <button
            type="button"
            onClick={() => onExport("excel")}
            className="button-secondary !px-4 !py-2 text-sm"
          >
            {exportLoading === "excel" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Excel
          </button>
          <button
            type="button"
            onClick={() => onExport("pdf")}
            className="button-primary !px-4 !py-2 text-sm"
          >
            {exportLoading === "pdf" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            PDF
          </button>
        </div>
      </div>

      {table.rows.length ? (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="report-table min-w-full">
              <thead>
                <tr>
                  {table.columns.map((column) => {
                    const isActive = sortKey === column.key;
                    return (
                      <th key={column.key}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!column.sortable) {
                              return;
                            }
                            if (sortKey === column.key) {
                              setSortDirection((current) =>
                                current === "asc" ? "desc" : "asc"
                              );
                            } else {
                              setSortKey(column.key);
                              setSortDirection("asc");
                            }
                          }}
                          className={`inline-flex items-center gap-2 ${
                            column.sortable ? "text-left" : "cursor-default"
                          }`}
                        >
                          <span>{column.label}</span>
                          {column.sortable ? (
                            isActive ? (
                              sortDirection === "asc" ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )
                            ) : (
                              <ChevronDown className="h-4 w-4 opacity-40" />
                            )
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, rowIndex) => (
                  <tr key={`${table.generatedAt}-${rowIndex}`}>
                    {table.columns.map((column) => {
                      const cellValue = row[column.key];
                      const cellKey = `${rowIndex}-${column.key}`;
                      const expanded = Boolean(expandedCells[cellKey]);
                      const canExpand =
                        (Array.isArray(cellValue) && cellValue.length > 2) ||
                        stringifyValue(cellValue).length > 120;

                      return (
                        <td key={column.key}>
                          <div className="space-y-2">
                            <div className="wrap-anywhere text-sm text-ink/72">
                              {renderPreview(cellValue, expanded)}
                            </div>
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedCells((current) => ({
                                    ...current,
                                    [cellKey]: !current[cellKey]
                                  }))
                                }
                                className="text-xs font-medium text-signal"
                              >
                                {expanded ? "Collapse" : "Expand"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/58">
            <p>
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="button-secondary !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="button-secondary !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="surface-muted mt-5 rounded-[1.6rem] border-dashed p-6 text-sm text-ink/55">
          {table.emptyMessage ?? "No rows matched the selected filters."}
        </div>
      )}
    </section>
  );
};
