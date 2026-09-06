import { ALLOWED_MIME_TYPES, buildStorageKey } from './documents.constants';

describe('buildStorageKey', () => {
  it('returns the fixed extension for each allowed mime type', () => {
    expect(buildStorageKey('org-1', 'doc-1', 'application/pdf')).toBe('org-1/doc-1.pdf');
    expect(
      buildStorageKey(
        'org-1',
        'doc-1',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('org-1/doc-1.docx');
    expect(buildStorageKey('org-1', 'doc-1', 'text/plain')).toBe('org-1/doc-1.txt');
  });

  it('throws for an unmapped mime type', () => {
    expect(() => buildStorageKey('org-1', 'doc-1', 'application/zip')).toThrow(
      /Unsupported mime type/,
    );
  });

  it('has no filename parameter at all — the function signature cannot be influenced by client-supplied names', () => {
    expect(buildStorageKey.length).toBe(3);
    // Even a maximally hostile "filename" has nowhere to be passed in.
    const key = buildStorageKey('org-1', 'doc-1', 'text/plain');
    expect(key).not.toContain('..');
    expect(key).toBe('org-1/doc-1.txt');
  });

  it('covers exactly the PDF/DOCX/TXT set (must stay in lockstep with Phase 4 extractors)', () => {
    expect(Object.keys(ALLOWED_MIME_TYPES).sort()).toEqual(
      [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ].sort(),
    );
  });
});
