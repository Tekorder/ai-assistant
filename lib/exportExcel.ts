// lib/exportExcel.ts
// ─────────────────────────────────────────────────────────────
//  Export task lists → Excel (SpreadsheetML 2003 XML).
//  Dependency-free: produces a real .xls workbook that Excel,
//  Google Sheets and LibreOffice open as a typed, multi-column
//  spreadsheet (not a plain CSV).
// ─────────────────────────────────────────────────────────────

import {
  type Block,
  isValidDateYYYYMMDD,
  isUncTitleBlock,
  todayYMD,
  UNC_TITLE,
} from './datacenter';

export type TaskRow = {
  list: string;
  task: string;
  /** YYYY-MM-DD, or '' when undated */
  due: string;
  status: 'Done' | 'Pending';
};

/**
 * Walk the flat block array into one row per task, labelled by the list it
 * lives under (loose tasks fall under "Uncategorized"). Archived blocks and
 * empty task rows are skipped.
 */
export function buildTaskRows(blocks: Block[]): TaskRow[] {
  const rows: TaskRow[] = [];
  let currentList = UNC_TITLE;

  for (const b of blocks) {
    if (b.archived === true) continue;
    if (b.indent === 0) {
      currentList = isUncTitleBlock(b) ? UNC_TITLE : (b.text || '').trim() || 'Untitled list';
      continue;
    }
    const task = (b.text || '').trim();
    if (!task) continue;
    rows.push({
      list: currentList,
      task,
      due: isValidDateYYYYMMDD(b.deadline) ? b.deadline! : '',
      status: b.checked === true ? 'Done' : 'Pending',
    });
  }
  return rows;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cell(value: string, type: 'String' | 'DateTime', styleId?: string): string {
  const style = styleId ? ` ss:StyleID="${styleId}"` : '';
  if (type === 'DateTime') {
    // SpreadsheetML expects ISO datetime; midnight keeps it a pure date.
    return `<Cell${style}><Data ss:Type="DateTime">${value}T00:00:00.000</Data></Cell>`;
  }
  return `<Cell${style}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function buildWorkbookXml(rows: TaskRow[], sheetName: string): string {
  const header =
    '<Row ss:StyleID="hdr">' +
    cell('List', 'String') +
    cell('Task', 'String') +
    cell('Due Date', 'String') +
    cell('Status', 'String') +
    '</Row>';

  const body = rows
    .map(r => {
      const due = r.due ? cell(r.due, 'DateTime', 'dt') : cell('', 'String');
      return (
        '<Row>' +
        cell(r.list, 'String') +
        cell(r.task, 'String') +
        due +
        cell(r.status, 'String') +
        '</Row>'
      );
    })
    .join('');

  // SpreadsheetML 2003. The mso-application PI makes Windows/Excel treat it as a workbook.
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:html="http://www.w3.org/TR/REC-html40">' +
    '<Styles>' +
    '<Style ss:ID="hdr"><Font ss:Bold="1"/>' +
    '<Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/>' +
    '<Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="dt"><NumberFormat ss:Format="yyyy-mm-dd"/></Style>' +
    '</Styles>' +
    `<Worksheet ss:Name="${xmlEscape(sheetName)}">` +
    '<Table>' +
    '<Column ss:Width="150"/>' +
    '<Column ss:Width="340"/>' +
    '<Column ss:Width="90"/>' +
    '<Column ss:Width="70"/>' +
    header +
    body +
    '</Table>' +
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">' +
    '<FreezePanes/><FrozenNoSplit/>' +
    '<SplitHorizontal>1</SplitHorizontal>' +
    '<TopRowBottomPane>1</TopRowBottomPane>' +
    '<ActivePane>2</ActivePane>' +
    '</WorksheetOptions>' +
    '</Worksheet>' +
    '</Workbook>'
  );
}

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tasks'
  );
}

/**
 * Build the workbook from the current blocks and trigger a browser download.
 * Returns the number of task rows written (0 ⇒ nothing to export).
 */
export function downloadTasksExcel(blocks: Block[], projectTitle?: string): number {
  const rows = buildTaskRows(blocks);
  const sheetName = (projectTitle || 'Tasks').trim().slice(0, 31) || 'Tasks';
  const xml = '﻿' + buildWorkbookXml(rows, sheetName);

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(projectTitle || 'tasks')}-${todayYMD()}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}
