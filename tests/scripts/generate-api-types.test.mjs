import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import openapiTS, { COMMENT_HEADER, astToString } from 'openapi-typescript';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { renderApiTypes } from '../../scripts/generate-source-api.mjs';

function document(schema) {
  return {
    openapi: '3.1.0', info: { title: 'Renderer control', version: '1' }, paths: {},
    components: { schemas: { Control: schema } },
  };
}

function diagnostics(text) {
  const file = resolve('tests/scripts/virtual-api-types.ts');
  const options = {
    noEmit: true, strict: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (path) => path === file ? text : readFile(path);
  host.fileExists = (path) => path === file || fileExists(path);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
}

describe('shared API declaration renderer', () => {
  it('the generated WOS client admits the populated native payload', async () => {
    const rendered = await readFile(resolve('src/api/generated/wos-public.d.ts'), 'utf8');
    expect(diagnostics(`${rendered}\nconst notice: components['schemas']['AdverseNoticeProposal']['machineReadable'] = {
      kind: 'adverseDecisionNotice', determinationId: 'fictional-determination',
      explanation: { reasoning: ['A retained reason'] }
    }; void notice;`)).toEqual([]);
    expect(rendered).toContain('AcceptedResponse: unknown;');
  });

  it('admits the native adverse notice payload when examples annotate its open object', async () => {
    // work-spec AdverseNoticeProposal.machineReadable: actual public/native schema shape.
    const rendered = await renderApiTypes(document({
      type: 'object',
      description: 'Structured machine-readable notice payload assembling reasons, rules, counterfactuals, and appeal instructions.',
      examples: [{ reason: 'Application denied.' }],
    }));
    expect(typeof rendered).toBe('string');
    expect(rendered.startsWith(COMMENT_HEADER)).toBe(true);
    expect(rendered).toContain('Control: Record<string, unknown>');
    expect(diagnostics(`${rendered}\nconst notice: components['schemas']['Control'] = {
      kind: 'adverseDecisionNotice', determinationId: 'fictional-determination',
      explanation: { reasoning: ['A retained reason'] }
    }; void notice;`)).toEqual([]);
  });

  it.each([
    ['closed empty', { type: 'object', additionalProperties: false }],
    ['nested closed', { type: 'object', properties: { closed: { type: 'object', additionalProperties: false } } }],
    ['structured', { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] }],
    ['composed', { type: 'object', allOf: [{ properties: { reason: { type: 'string' } } }] }],
    ['legacy nullable property', { type: 'object', properties: { value: { type: 'object', nullable: true } } }],
    ['typed additional properties', { type: 'object', additionalProperties: { type: 'string' } }],
    ['minimum properties', { type: 'object', minProperties: 1 }],
    ['constant object', { type: 'object', const: { reason: 'retained' } }],
    ['closed examples', { type: 'object', additionalProperties: false, examples: [{}] }],
  ])('delegates %s without changing library output', async (_label, schema) => {
    const input = document(schema);
    expect(await renderApiTypes(input)).toBe(COMMENT_HEADER + astToString(await openapiTS(input)));
  });

  it('keeps null in the supported nullable-array open object', async () => {
    const rendered = await renderApiTypes(document({ type: ['object', 'null'], examples: [{}] }));
    expect(rendered).toContain('Control: Record<string, unknown> | null');
    expect(diagnostics(`${rendered}\nconst nullable: components['schemas']['Control'] = null;
      const populated: components['schemas']['Control'] = { reason: 'retained' };
      void nullable; void populated;`)).toEqual([]);
  });

  it('still rejects properties on a closed empty object', async () => {
    const rendered = await renderApiTypes(document({ type: 'object', additionalProperties: false }));
    const errors = diagnostics(`${rendered}\nconst closed: components['schemas']['Control'] = { reason: 'refused' }; void closed;`);
    expect(errors.map(({ code }) => code)).toEqual([2322]);
  });
});
