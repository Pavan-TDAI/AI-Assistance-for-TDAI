import type { ExportFormat, ExportTableRequest } from "@personal-ai/shared";

import { stringifyCellValue } from "./reporting-utils.js";

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const hexToRgb = (value: string) => {
  const normalised = value.replace("#", "");
  const red = Number.parseInt(normalised.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalised.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalised.slice(4, 6), 16) / 255;
  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
};

const flattenListItems = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenListItems(entry)).filter(Boolean);
  }

  const text = stringifyCellValue(value).trim();
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n+/)
    .map((entry) => entry.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter(Boolean);
};

const formatCellText = (value: unknown, listMode: "inline" | "multiline" = "inline") => {
  if (Array.isArray(value)) {
    const items = flattenListItems(value);
    if (!items.length) {
      return "";
    }

    return listMode === "multiline"
      ? items.map((entry, index) => `${index + 1}. ${entry}`).join("\n")
      : items.join(" | ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const wrapText = (value: string, maxChars: number) => {
  const lines = value
    .split(/\r?\n/)
    .flatMap((entry) => {
      const words = entry.split(/\s+/).filter(Boolean);
      if (!words.length) {
        return [""];
      }

      const wrapped: string[] = [];
      let current = "";
      for (const word of words) {
        if (word.length > maxChars) {
          if (current) {
            wrapped.push(current);
            current = "";
          }

          for (let index = 0; index < word.length; index += maxChars) {
            wrapped.push(word.slice(index, index + maxChars));
          }
          continue;
        }

        if (!current) {
          current = word;
          continue;
        }

        if (`${current} ${word}`.length <= maxChars) {
          current = `${current} ${word}`;
          continue;
        }

        wrapped.push(current);
        current = word;
      }

      if (current) {
        wrapped.push(current);
      }

      return wrapped;
    })
    .filter((line) => line.length || value.trim().length === 0);

  return lines.length ? lines : [""];
};

const computeColumnWidths = (request: ExportTableRequest, totalWidth: number) => {
  const rawWidths = request.columns.map((column) => {
    const sampleLengths = request.rows
      .slice(0, 40)
      .map((row) => formatCellText(row[column.key], "multiline").split(/\r?\n/))
      .flat()
      .map((entry) => entry.slice(0, 120).length);
    const basis = Math.max(column.label.length, ...sampleLengths);
    return Math.max(90, Math.min(220, 42 + basis * 4.6));
  });

  const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0);
  if (rawTotal <= totalWidth) {
    return rawWidths;
  }

  const scale = totalWidth / rawTotal;
  const scaled = rawWidths.map((width) => Math.max(72, width * scale));
  const scaledTotal = scaled.reduce((sum, width) => sum + width, 0);
  const adjustment = totalWidth - scaledTotal;
  if (scaled.length) {
    const lastIndex = scaled.length - 1;
    scaled[lastIndex] = (scaled[lastIndex] ?? 0) + adjustment;
  }

  return scaled;
};

const buildCsv = (request: ExportTableRequest) => {
  const metadataLines = Object.entries(request.appliedFilters).map(
    ([key, value]) => `${escapeCsv(key)},${escapeCsv(value)}`
  );
  const header = request.columns.map((column) => escapeCsv(column.label)).join(",");
  const rows = request.rows.map((row) =>
    request.columns
      .map((column) => escapeCsv(formatCellText(row[column.key], "multiline")))
      .join(",")
  );

  return Buffer.from(
    [escapeCsv(request.title), ...metadataLines, "", header, ...rows].join("\n"),
    "utf8"
  );
};

const buildExcelWorkbook = (request: ExportTableRequest) => {
  const columnWidths = computeColumnWidths(request, 1180).map((width) =>
    Math.max(80, Math.round(width))
  );
  const frozenRowCount = Object.keys(request.appliedFilters).length + 3;
  const columns = request.columns
    .map(
      (_column, index) =>
        `<Column ss:Index="${index + 1}" ss:AutoFitWidth="0" ss:Width="${columnWidths[index] ?? 120}" />`
    )
    .join("");
  const metadataRows = Object.entries(request.appliedFilters)
    .map(
      ([key, value]) =>
        `<Row>
          <Cell ss:StyleID="metaLabel"><Data ss:Type="String">${escapeXml(key)}</Data></Cell>
          <Cell ss:StyleID="metaValue" ss:MergeAcross="${Math.max(request.columns.length - 2, 0)}"><Data ss:Type="String">${escapeXml(
            value
          )}</Data></Cell>
        </Row>`
    )
    .join("");
  const headerRow = `<Row ss:Height="28">${request.columns
    .map(
      (column) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`
    )
    .join("")}</Row>`;
  const dataRows = request.rows
    .map(
      (row) =>
        `<Row>${request.columns
          .map(
            (column) =>
              `<Cell ss:StyleID="body"><Data ss:Type="String">${escapeXml(
                formatCellText(row[column.key], "multiline")
              )}</Data></Cell>`
          )
          .join("")}</Row>`
    )
    .join("");

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="14" ss:Color="#102A43" />
      <Alignment ss:Vertical="Center" />
      <Interior ss:Color="#F4F8F8" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="metaLabel">
      <Font ss:Bold="1" ss:Color="#0B2A34" />
      <Interior ss:Color="#EEF7F5" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
      </Borders>
    </Style>
    <Style ss:ID="metaValue">
      <Alignment ss:Vertical="Center" ss:WrapText="1" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
      </Borders>
    </Style>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#0B2A34" />
      <Alignment ss:Vertical="Center" ss:WrapText="1" />
      <Interior ss:Color="#D6EEE9" ss:Pattern="Solid" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#95B8B0" />
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#95B8B0" />
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#95B8B0" />
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#95B8B0" />
      </Borders>
    </Style>
    <Style ss:ID="body">
      <Alignment ss:Vertical="Top" ss:WrapText="1" />
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D2DCE5" />
      </Borders>
    </Style>
  </Styles>
  <Worksheet ss:Name="Report">
    <Table x:FullColumns="1" x:FullRows="1">
      ${columns}
      <Row ss:Height="26">
        <Cell ss:StyleID="title" ss:MergeAcross="${Math.max(request.columns.length - 1, 0)}">
          <Data ss:Type="String">${escapeXml(request.title)}</Data>
        </Cell>
      </Row>
      ${metadataRows}
      <Row />
      ${headerRow}
      ${dataRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes />
      <FrozenNoSplit />
      <SplitHorizontal>${frozenRowCount}</SplitHorizontal>
      <TopRowBottomPane>${frozenRowCount}</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  return Buffer.from(workbook, "utf8");
};

const drawRect = (x: number, y: number, width: number, height: number, fillHex?: string) => {
  const commands = [`0.85 0.89 0.92 RG`, `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`];
  if (fillHex) {
    commands.push(`${hexToRgb(fillHex)} rg`, "B");
  } else {
    commands.push("S");
  }
  return commands.join("\n");
};

const drawTextLine = (
  text: string,
  x: number,
  y: number,
  fontName: "F1" | "F2",
  fontSize: number,
  colorHex = "#22303C"
) =>
  [
    "BT",
    `/${fontName} ${fontSize} Tf`,
    `${hexToRgb(colorHex)} rg`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `(${escapePdfText(text)}) Tj`,
    "ET"
  ].join("\n");

const buildPdfStreams = (request: ExportTableRequest) => {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 28;
  const padding = 5;
  const headerLineHeight = 11;
  const bodyLineHeight = 10;
  const titleFontSize = 15;
  const metaFontSize = 9;
  const headerFontSize = 8.6;
  const bodyFontSize = 8;
  const availableWidth = pageWidth - margin * 2;
  const columnWidths = computeColumnWidths(request, availableWidth);
  const metadataEntries = Object.entries(request.appliedFilters);
  const bottomLimit = margin + 18;

  const streams: string[] = [];
  let commands: string[] = [];
  let pageNumber = 1;

  const startPage = () => {
    commands = [];
    let cursorY = pageHeight - margin;

    commands.push(drawTextLine(request.title, margin, cursorY, "F2", titleFontSize, "#102A43"));
    cursorY -= 18;

    for (const [key, value] of metadataEntries) {
      commands.push(
        drawTextLine(`${key}: ${value}`, margin, cursorY, "F1", metaFontSize, "#4A5568")
      );
      cursorY -= 12;
    }

    if (metadataEntries.length) {
      cursorY -= 4;
    }

    return cursorY;
  };

  let currentY = startPage();

  const renderHeader = () => {
    const headerCells = request.columns.map((column, index) => {
      const width = columnWidths[index] ?? 110;
      const maxChars = Math.max(8, Math.floor((width - padding * 2) / 4.8));
      return wrapText(column.label, maxChars);
    });
    const headerHeight =
      Math.max(...headerCells.map((lines) => lines.length), 1) * headerLineHeight +
      padding * 2 +
      2;
    let x = margin;
    for (let index = 0; index < request.columns.length; index += 1) {
      const width = columnWidths[index] ?? 110;
      commands.push(drawRect(x, currentY - headerHeight, width, headerHeight, "#D6EEE9"));
      const headerLines = headerCells[index] ?? [request.columns[index]?.label ?? ""];
      for (let lineIndex = 0; lineIndex < headerLines.length; lineIndex += 1) {
        commands.push(
          drawTextLine(
            headerLines[lineIndex] ?? "",
            x + padding,
            currentY - padding - headerLineHeight * (lineIndex + 1) + 2,
            "F2",
            headerFontSize,
            "#0B2A34"
          )
        );
      }
      x += width;
    }
    currentY -= headerHeight;
  };

  const finishPage = () => {
    commands.push(
      drawTextLine(`Page ${pageNumber}`, pageWidth - margin - 42, margin - 6, "F1", 8, "#718096")
    );
    streams.push(commands.join("\n"));
    pageNumber += 1;
  };

  renderHeader();

  for (const row of request.rows) {
    const wrappedCells = request.columns.map((column, index) => {
      const width = columnWidths[index] ?? 110;
      const maxChars = Math.max(10, Math.floor((width - padding * 2) / 4.6));
      return wrapText(formatCellText(row[column.key], "multiline"), maxChars);
    });
    const offsets = wrappedCells.map(() => 0);

    while (offsets.some((offset, index) => offset < (wrappedCells[index]?.length ?? 0))) {
      const minimumRowHeight = bodyLineHeight + padding * 2;
      if (currentY - minimumRowHeight < bottomLimit) {
        finishPage();
        currentY = startPage();
        renderHeader();
      }

      const availableLines = Math.max(
        1,
        Math.floor((currentY - bottomLimit - padding * 2) / bodyLineHeight)
      );
      const remainingLines = Math.max(
        ...wrappedCells.map((cell, index) => Math.max((cell.length ?? 1) - (offsets[index] ?? 0), 0)),
        1
      );
      const linesThisChunk = Math.max(1, Math.min(availableLines, remainingLines));
      const rowHeight = linesThisChunk * bodyLineHeight + padding * 2;

      let x = margin;
      for (let index = 0; index < request.columns.length; index += 1) {
        const width = columnWidths[index] ?? 110;
        commands.push(drawRect(x, currentY - rowHeight, width, rowHeight));
        const lines = wrappedCells[index] ?? [""];
        const start = offsets[index] ?? 0;
        const chunk = lines.slice(start, start + linesThisChunk);
        if (start > 0 && chunk.length) {
          chunk[0] = `(continued) ${chunk[0]}`;
        }
        for (let lineIndex = 0; lineIndex < chunk.length; lineIndex += 1) {
          commands.push(
            drawTextLine(
              chunk[lineIndex] ?? "",
              x + padding,
              currentY - padding - bodyLineHeight * (lineIndex + 1) + 2,
              "F1",
              bodyFontSize,
              "#22303C"
            )
          );
        }
        offsets[index] = start + chunk.length;
        x += width;
      }

      currentY -= rowHeight;
    }
  }

  finishPage();
  return streams;
};

const buildPdf = (request: ExportTableRequest) => {
  const streams = buildPdfStreams(request);
  const pageWidth = 842;
  const pageHeight = 595;
  let nextObjectId = 1;

  const objects = new Map<number, string>();
  const allocateObjectId = () => {
    const id = nextObjectId;
    nextObjectId += 1;
    return id;
  };

  const catalogId = allocateObjectId();
  const pagesId = allocateObjectId();
  const regularFontId = allocateObjectId();
  const boldFontId = allocateObjectId();
  const contentIds = streams.map(() => allocateObjectId());
  const pageIds = streams.map(() => allocateObjectId());

  objects.set(catalogId, `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj`);
  objects.set(
    regularFontId,
    `${regularFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  );
  objects.set(
    boldFontId,
    `${boldFontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`
  );

  for (let index = 0; index < streams.length; index += 1) {
    const contentId = contentIds[index] ?? allocateObjectId();
    const pageId = pageIds[index] ?? allocateObjectId();
    const stream = streams[index] ?? "";

    objects.set(
      contentId,
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj`
    );
    objects.set(
      pageId,
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`
    );
  }

  objects.set(
    pagesId,
    `${pagesId} 0 obj\n<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds
      .map((pageId) => `${pageId} 0 R`)
      .join(" ")}] >>\nendobj`
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let id = 1; id < nextObjectId; id += 1) {
    const object = objects.get(id);
    if (!object) {
      continue;
    }
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${offsets.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};

export const renderExportFile = (request: ExportTableRequest): ExportedFile => {
  const formatMap: Record<ExportFormat, ExportedFile> = {
    csv: {
      buffer: buildCsv(request),
      contentType: "text/csv; charset=utf-8",
      extension: "csv"
    },
    excel: {
      buffer: buildExcelWorkbook(request),
      contentType: "application/vnd.ms-excel",
      extension: "xls"
    },
    pdf: {
      buffer: buildPdf(request),
      contentType: "application/pdf",
      extension: "pdf"
    }
  };

  return formatMap[request.format];
};
