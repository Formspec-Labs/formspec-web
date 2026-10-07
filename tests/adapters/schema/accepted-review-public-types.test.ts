import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA as presentation,
  ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA as state,
  ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA as data,
} from '@formspec-org/surface-react/widget-metadata';

// These accesses must compile for consumers of the maintained public metadata.
// Runtime equality guards the declaration against claiming missing properties.
describe('accepted review public metadata declarations', () => {
  it('preserves inherited named properties and the accepted phase', () => {
    expect(presentation.properties.responseHash.pattern).toBe('^[a-f0-9]{64}$');
    expect(presentation.properties.definitionUrl.type).toBe('string');
    expect(presentation.properties.definitionVersion.type).toBe('string');
    expect(presentation.properties.locale.type).toBe('string');
    expect(presentation.properties.fields.type).toBe('object');
    expect(presentation.properties.phase.const).toBe('accepted-record');
    expect(state.properties.status.enum).toContain('ready');
    expect(state.properties.contextIdentity.type).toBe('string');
    expect(state.properties.locale.type).toBe('string');
    expect(data.properties.presentation.properties.responseHash).toBe(presentation.properties.responseHash);
    expect(data.properties.presentation.properties.fields).toBe(presentation.properties.fields);
    expect('actorRef' in presentation.properties).toBe(false);
    expect('draft' in presentation.properties).toBe(false);
  });
});
