import type {
  CodeCellType,
  MarkdownCellType,
  PackageJsonCellType,
  TitleCellType,
  PlaceholderCellType,
  CellWithPlaceholderType,
  CodeLanguageType,
} from '@peragus/shared'; // @ts-ignore
import type { SrcbookType } from './types.mjs';

type SrcbookWithPlacebolderType = Omit<SrcbookType, 'cells'> & {
  cells: CellWithPlaceholderType[];
};

export function encode(srcbook: SrcbookWithPlacebolderType, options: { inline: boolean }) {
  const [firstCell, secondCell, ...remainingCells] = srcbook.cells;
  const titleCell = firstCell as TitleCellType;
  const packageJsonCell = secondCell as PackageJsonCellType;
  const cells = remainingCells as (MarkdownCellType | CodeCellType | PlaceholderCellType)[];

  const encoded = [
    encodeMetdata(srcbook),
    encodeTitleCell(titleCell),
    encodePackageJsonCell(packageJsonCell, options),
    ...cells.map((cell) => {
      switch (cell.type) {
        case 'code':
          return encodeCodeCell(cell, options);
        case 'markdown':
          return encodeMarkdownCell(cell);
        case 'placeholder':
          return encodePlacebolderCell(cell);
      }
    }),
  ];

  // End every file with exactly one newline.
  return encoded.join('\n\n').trimEnd() + '\n';
}

function encodeMetdata(srcbook: SrcbookWithPlacebolderType) {
  const metadata: { language: CodeLanguageType; 'tsconfig.json'?: any } = {
    language: srcbook.language,
  };

  // tsconfig is kept as a string in srcbook. However, when encoding
  // it in srcmd, we need it to be an object in the metadata header.
  if (srcbook.language === 'typescript' && srcbook['tsconfig.json']) {
    try {
      const parsed = JSON.parse(srcbook['tsconfig.json']);
      metadata['tsconfig.json'] = parsed;
    } catch (e) {
      // This should never happen
      console.error('Failed to parse tsconfig.json:', e);
    }
  }

  return `<!-- srcbook:${JSON.stringify(metadata)} -->`;
}

function encodeTitleCell(cell: TitleCellType) {
  return `# ${cell.text}`;
}

function encodeMarkdownCell(cell: MarkdownCellType) {
  return cell.text.trim();
}

function encodePlacebolderCell(cell: PlaceholderCellType) {
  return cell.text;
}

function encodePackageJsonCell(cell: PackageJsonCellType, options: { inline: boolean }) {
  return options.inline
    ? encodeFileInline({
        filename: 'package.json',
        language: 'json',
        source: cell.source,
      })
    : encodeFileExternal({
        filename: 'package.json',
        filepath: './package.json',
      });
}

function encodeCodeCell(cell: CodeCellType, options: { inline: boolean }) {
  return options.inline
    ? encodeFileInline({
        filename: cell.filename,
        language: cell.language,
        source: cell.source,
      })
    : encodeFileExternal({
        filename: cell.filename,
        filepath: `./src/${cell.filename}`,
      });
}

function encodeFileInline(options: { filename: string; language: string; source: string }) {
  const { filename, language, source } = options;
  return `###### ${filename}\n\n\`\`\`${language}\n${source}\n\`\`\``;
}

function encodeFileExternal(options: { filename: string; filepath: string }) {
  const { filename, filepath } = options;
  return `###### ${filename}\n\n[${filename}](${filepath})`;
}
