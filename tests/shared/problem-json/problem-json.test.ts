import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HttpAdapterError, HttpClient } from '../../../src/adapters/http/http-client.ts';
import { assertProblemJson, isProblemJson } from '../../../src/shared/problem-json.ts';
import errorSchema from '../../../vendor/wos-api/error.schema.json';
import formspecServer from '../../../vendor/problem-json/formspec-server.json';
import stackCommon from '../../../vendor/problem-json/stack-common.json';
import stackCommonAuth from '../../../vendor/problem-json/stack-common-auth.json';
import stackCommonIdempotency from '../../../vendor/problem-json/stack-common-idempotency.json';
import wosServer from '../../../vendor/problem-json/wos-server.json';

const schemaProblem = errorSchema.$defs.Problem;

/** `components.schemas.Problem`'s members in a generated client, read with the TypeScript parser. */
function generatedProblemMembers(path: string): Record<string, 'required' | 'optional'> {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  const member = (node: ts.Node | undefined, name: string): ts.PropertySignature | undefined => {
    const members: readonly ts.TypeElement[] =
      node && (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) ? node.members : [];
    return members.filter(ts.isPropertySignature).find(m => m.name.getText(source).replace(/"/g, '') === name);
  };
  const components = source.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'components');
  const problem = member(member(components, 'schemas')?.type, 'Problem')?.type;
  if (!problem || !ts.isTypeLiteralNode(problem)) throw new Error(`${path} has no generated Problem`);
  return Object.fromEntries(problem.members.filter(ts.isPropertySignature).map(m =>
    [m.name.getText(source), m.questionToken ? 'optional' : 'required']));
}

describe('Problem JSON type', () => {
  const fromSchema = Object.fromEntries(Object.keys(schemaProblem.properties).map(name =>
    [name, schemaProblem.required.includes(name) ? 'required' : 'optional']));

  // Each provider document a caller is generated from must carry the schema's member set.
  it.each(['src/api/generated/wos-public.d.ts', 'src/api/generated/source-public.d.ts'])(
    '%s generates exactly the schema members and their optionality', path => {
      expect(generatedProblemMembers(path)).toEqual(fromSchema);
    });
});

describe('Problem JSON admission', () => {
  const emitted = [...stackCommon, ...stackCommonAuth, ...stackCommonIdempotency, ...formspecServer, ...wosServer];

  it.each(emitted.map(({ case: name, body }) => [`${body.error_code} ${name}`, body]))(
    'admits the server-emitted %s', (_name, body) => {
      expect(isProblemJson(body)).toBe(true);
    });

  it('covers required-only and every optional member', () => {
    const members = new Set(emitted.flatMap(({ body }) => Object.keys(body)));
    expect([...members].sort()).toEqual(Object.keys(schemaProblem.properties).sort());
    expect(emitted.some(({ body }) => Object.keys(body).length === schemaProblem.required.length)).toBe(true);
  });

  it('decodes an emitted body through the HTTP client', async () => {
    const [{ body }] = formspecServer.filter(({ case: name }) => name === 'submit_validation_refused');
    const client = new HttpClient({
      baseUrl: 'https://source.example',
      fetchImpl: async () => new Response(JSON.stringify(body), {
        status: body.status,
        headers: { 'content-type': 'application/problem+json' },
      }),
    });
    const error = await client.getJson('/drafts/d').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpAdapterError);
    expect((error as HttpAdapterError).problem).toEqual(body);
  });

  const valid = wosServer[0].body;
  it.each([
    ['legacy code member', { ...withoutErrorCode(valid), code: valid.error_code }],
    ['ungoverned prefix', { ...valid, error_code: 'BOGUS-1404' }],
    ['lowercase code', { ...valid, error_code: valid.error_code.toLowerCase() }],
    ['three-digit code', { ...valid, error_code: 'WOS-140' }],
    ['undeclared member', { ...valid, field_errors: [] }],
    ['status outside 400-599', { ...valid, status: 302 }],
    ['null detail', { ...valid, detail: null }],
    ['missing title', { ...valid, title: undefined }],
  ])('refuses a %s', (_name, body) => {
    expect(isProblemJson(JSON.parse(JSON.stringify(body)))).toBe(false);
    expect(() => assertProblemJson(JSON.parse(JSON.stringify(body)))).toThrow();
  });
});

function withoutErrorCode(body: Record<string, unknown>): Record<string, unknown> {
  const { error_code: _omitted, ...rest } = body;
  return rest;
}
