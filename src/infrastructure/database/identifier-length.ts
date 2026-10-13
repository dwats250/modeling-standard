/**
 * PostgreSQL silently truncates identifiers longer than 63 bytes
 * (NAMEDATALEN - 1), so a name in a migration can differ from the name in
 * the catalog. This finds double-quoted identifiers over that limit in
 * migration SQL. Deliberately small: a regular expression over quoted
 * names, not a SQL parser. Unquoted names are not checked.
 */

export const POSTGRES_IDENTIFIER_MAX_BYTES = 63;

export interface LongIdentifier {
  readonly file: string;
  readonly identifier: string;
  readonly bytes: number;
}

/**
 * Over-long names that already shipped in a merged migration. They cannot be
 * edited; each must be fixed forward by a later migration, named here.
 */
export const KNOWN_LONG_IDENTIFIERS: readonly { readonly file: string; readonly identifier: string; readonly fixedBy: string }[] = [
  {
    file: '0009_presented_versions.sql',
    identifier: 'agreement_version_pairwise_agreement_id_pairwise_agreement_id_fk',
    fixedBy: '0014_agreement_version_fk_name.sql',
  },
];

export function findLongIdentifiers(file: string, sql: string): LongIdentifier[] {
  const found: LongIdentifier[] = [];
  for (const match of sql.matchAll(/"((?:[^"]|"")+)"/g)) {
    const identifier = match[1]!.replaceAll('""', '"');
    const bytes = Buffer.byteLength(identifier, 'utf8');
    if (bytes > POSTGRES_IDENTIFIER_MAX_BYTES) found.push({ file, identifier, bytes });
  }
  return found;
}

export function isKnownLongIdentifier(item: LongIdentifier): boolean {
  return KNOWN_LONG_IDENTIFIERS.some((known) => known.file === item.file && known.identifier === item.identifier);
}
