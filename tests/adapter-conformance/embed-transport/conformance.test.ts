import {
  stubEmbedTransport,
  type StubEmbedTransport,
} from '../../../src/adapters/stub/embed-transport.ts';
import { defineEmbedTransportConformance } from '../_framework/conformance.ts';

defineEmbedTransportConformance('stub EmbedTransport conformance', () => {
  const adapter: StubEmbedTransport = stubEmbedTransport({
    embedded: true,
    hostOrigin: 'https://allowed.example.test',
  });
  return { adapter };
});
