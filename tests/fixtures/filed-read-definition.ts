/** A singleton filing that reads one answer from its own previous filing. */
export function filedReadDefinition(path: string) {
  const url = 'https://example.test/forms/annual';
  return {
    $formspec: '1.0', url, version: '1.0.0', title: 'Annual report', status: 'active',
    subject: { type: 'urn:example:annual', keys: {} },
    items: [{ key: 'amount', label: 'Amount', type: 'field', dataType: 'integer' }],
    instances: { prior: {
      response: { definition: { url }, subject: [], status: 'completed', cardinality: 'latest', pin: 'none' },
      schema: { [path]: 'integer' },
    } },
  };
}
