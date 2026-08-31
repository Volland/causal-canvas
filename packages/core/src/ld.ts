import jsonldModule from 'jsonld';
import { context as bundledContext } from '@causal-canvas/spec';
import type { CanonicalDocument } from './types.js';

const jsonld: any = (jsonldModule as any).default ?? jsonldModule;

/**
 * Build the JSON-LD form of a normalized document.
 *
 * The bundled context is inlined so expansion never touches the network
 * (§1.2), and node types are attached here rather than stored in the document,
 * keeping the on-disk JSON free of RDF ceremony.
 *
 * Relations become reified entities because a relation carries properties and
 * an RDF triple has no attributes. See §8.
 */
// @lat: [[format#CausalJSON#JSON-LD Binding]]
export function toJsonLd(document: CanonicalDocument): Record<string, unknown> {
  const inline = (bundledContext as any)['@context'];
  return {
    '@context': inline,
    '@type': 'Model',
    ...Object.fromEntries(
      Object.entries(document).filter(([key]) => key !== '@context' && key !== '$schema'),
    ),
    variables: document.variables.map((variable) => ({ '@type': 'Variable', ...variable })),
    relations: document.relations.map((relation) => ({ '@type': 'Relation', ...relation })),
  };
}

/** Expand a normalized document to JSON-LD expanded form. */
export async function expand(document: CanonicalDocument): Promise<unknown[]> {
  return (await jsonld.expand(toJsonLd(document))) as unknown[];
}

/** Serialize a normalized document as N-Quads. */
export async function toNQuads(document: CanonicalDocument): Promise<string> {
  return (await jsonld.toRDF(toJsonLd(document), { format: 'application/n-quads' })) as string;
}
