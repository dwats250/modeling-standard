import type { ContractView } from './contract.ts';

/**
 * A proposal rendering of one party's view of a final contract (S11), for
 * Cory's reaction in the operator's record inspector. It is not product
 * presentation: what each clause shows, the signing act and every label are
 * open (D04, D05; package §7 Q1, Q2), and nothing here answers them. It is
 * shown to no participant.
 *
 * A pure function over `getContractVisibleTo`'s result, so it can contain
 * only what that party may see: no signature time, IP, user agent, hash,
 * fingerprint, account or position. The page is self-contained (no external
 * reference, no style, no script; its content security policy forbids any
 * load) and every stored value is escaped. Parties appear by id: no name is
 * stored.
 */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// No styles, inline or otherwise: the page loads nothing and runs nothing,
// and it can be shown inside a page whose own policy forbids inline styles.
const CSP = "default-src 'none'; base-uri 'none'; form-action 'none'";

/** The proposal rendering, as a complete HTML document. */
export function renderContractHtml(view: ContractView): string {
  const id = (party: string) => `<code>${escapeHtml(party)}</code>`;
  const parties = view.parties
    .map((p) => `<li>${id(p.id)}${p.id === view.partyId ? ' (this view)' : ''} — on site: ${p.onSite ? 'yes' : 'no'}</li>`)
    .join('');
  const clauses = view.clauses
    .map((c) => {
      const value = c.value === null ? '' : `<div>${escapeHtml(c.value)}</div>`;
      const scope = c.between === null ? 'project-wide' : `between ${c.between.map(id).join(' and ')}`;
      const approvers = c.approverPartyIds.length ? c.approverPartyIds.map(id).join(', ') : 'none';
      return `<li><div>${escapeHtml(c.content)}</div>${value}<div>layer: ${escapeHtml(c.layer)} · ${scope} · approvers recorded with this clause: ${approvers}</div></li>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proposal rendering — synthetic</title>
</head>
<body>
<p><strong>Proposal rendering for Cory's reaction — synthetic.</strong> An engineering sketch of how one party's view of a stored final record could be shown. Not product wording and not a legal document. What each clause shows, the signing act and every label are open (D04, D05). Shown only in the operator's record inspector.</p>
<p>Record ${id(view.contractId)} · viewed as party ${id(view.partyId)}</p>
<h2>Parties</h2>
<ul>${parties}</ul>
<h2>Clauses</h2>
<ol>${clauses}</ol>
<p>Both parties' bound-account signature evidence is stored with this record, by an operator-only synthetic finalization.</p>
</body>
</html>
`;
}
