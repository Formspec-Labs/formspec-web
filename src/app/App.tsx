import { useEffect, useMemo, useState } from 'react';
import type { FormDefinition, FormItem, FormOption } from '@formspec-org/types';
import type { FormspecWebConfig } from '../config/types.ts';
import { useComposition } from './hooks/useComposition.ts';

interface AppProps {
  config: FormspecWebConfig;
}

type DefinitionState =
  | { status: 'loading' }
  | { status: 'ready'; definition: FormDefinition }
  | { status: 'error'; message: string };

export function App({ config }: AppProps) {
  const composition = useComposition();
  const [definitionState, setDefinitionState] = useState<DefinitionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setDefinitionState({ status: 'loading' });
    void composition.definitionSource
      .getDefinition(composition.initialDefinitionUrl)
      .then((definition) => {
        if (!cancelled) {
          setDefinitionState({ status: 'ready', definition });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDefinitionState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load form definition',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [composition]);

  return (
    <main className="shell" aria-busy={definitionState.status === 'loading'}>
      {definitionState.status === 'loading' ? (
        <div className="shell__status" role="status">
          Loading form
        </div>
      ) : null}
      {definitionState.status === 'error' ? (
        <div className="shell__status shell__status--error" role="alert">
          {definitionState.message}
        </div>
      ) : null}
      {definitionState.status === 'ready' ? (
        <DefinitionPreview
          brandName={config.brand.name}
          definition={definitionState.definition}
          mode={composition.mode}
        />
      ) : null}
    </main>
  );
}

function DefinitionPreview({
  brandName,
  definition,
  mode,
}: {
  brandName: string;
  definition: FormDefinition;
  mode: 'demo' | 'production';
}) {
  const requiredPaths = useMemo(
    () =>
      new Set(
        definition.binds
          ?.filter((bind) => bind.required === true || bind.required === 'true')
          .map((bind) => bind.path) ?? [],
      ),
    [definition.binds],
  );
  const issuerName = displayName(definition.issuer) ?? brandName;
  const localeLabels = localeSummary(definition);

  return (
    <div className="shell__inner">
      <header className="form-hero">
        <p className="form-hero__issuer">{issuerName}</p>
        <h1 className="form-hero__title">{definition.title}</h1>
        {definition.description ? (
          <p className="form-hero__description">{definition.description}</p>
        ) : null}
        <dl className="form-hero__meta" aria-label="Form metadata">
          <div>
            <dt>Profile</dt>
            <dd>{mode}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{definition.version}</dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd>{localeLabels}</dd>
          </div>
        </dl>
      </header>

      <form className="demo-form" aria-label={definition.title}>
        {definition.items.map((item) => (
          <ItemNode
            definition={definition}
            item={item}
            key={item.key}
            path={item.key}
            requiredPaths={requiredPaths}
          />
        ))}
      </form>
    </div>
  );
}

function ItemNode({
  definition,
  item,
  path,
  requiredPaths,
}: {
  definition: FormDefinition;
  item: FormItem;
  path: string;
  requiredPaths: ReadonlySet<string>;
}) {
  if (item.type === 'display') {
    return <p className="demo-display">{item.label}</p>;
  }

  if (item.type === 'group') {
    const children = item.children ?? [];
    return (
      <fieldset className="demo-section">
        <legend>{item.label}</legend>
        {item.description ? <p className="demo-section__description">{item.description}</p> : null}
        <div className="demo-section__fields">
          {children.map((child) => (
            <ItemNode
              definition={definition}
              item={child}
              key={child.key}
              path={`${path}.${child.key}`}
              requiredPaths={requiredPaths}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <FieldNode
      definition={definition}
      item={item}
      path={path}
      required={isRequiredPath(path, requiredPaths)}
    />
  );
}

function FieldNode({
  definition,
  item,
  path,
  required,
}: {
  definition: FormDefinition;
  item: FormItem;
  path: string;
  required: boolean;
}) {
  const inputId = `field-${path.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const descriptionId = item.hint ? `${inputId}-hint` : undefined;
  return (
    <div className="demo-field">
      <label htmlFor={inputId}>
        {item.label}
        {required ? <span aria-label="required"> *</span> : null}
      </label>
      <FieldControl
        definition={definition}
        describedBy={descriptionId}
        inputId={inputId}
        item={item}
        required={required}
      />
      {item.hint ? (
        <p className="demo-field__hint" id={descriptionId}>
          {item.hint}
        </p>
      ) : null}
    </div>
  );
}

function FieldControl({
  definition,
  describedBy,
  inputId,
  item,
  required,
}: {
  definition: FormDefinition;
  describedBy: string | undefined;
  inputId: string;
  item: FormItem;
  required: boolean;
}) {
  const options = optionsFor(definition, item);
  const commonProps = {
    'aria-describedby': describedBy,
    id: inputId,
    name: inputId,
    required,
  };

  if (item.dataType === 'boolean') {
    return <input {...commonProps} type="checkbox" />;
  }

  if (item.dataType === 'text') {
    return <textarea {...commonProps} rows={4} />;
  }

  if (options.length > 0 || item.dataType === 'choice') {
    return (
      <select {...commonProps} defaultValue="">
        <option value="" disabled>
          Select
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (item.dataType === 'integer' || item.dataType === 'decimal') {
    return <input {...commonProps} inputMode="numeric" type="number" />;
  }

  if (item.dataType === 'date') {
    return <input {...commonProps} type="date" />;
  }

  return <input {...commonProps} type="text" />;
}

function optionsFor(definition: FormDefinition, item: FormItem): FormOption[] {
  if (item.options) {
    return item.options;
  }
  if (!item.optionSet) {
    return [];
  }
  return definition.optionSets?.[item.optionSet]?.options ?? [];
}

function isRequiredPath(path: string, requiredPaths: ReadonlySet<string>): boolean {
  return requiredPaths.has(path) || requiredPaths.has(path.replace('.', '[*].'));
}

function displayName(issuer: FormDefinition['issuer']): string | undefined {
  if (!issuer || !('name' in issuer)) {
    return undefined;
  }
  const name = issuer.displayName ?? issuer.name;
  return typeof name === 'string' ? name : name.en;
}

function localeSummary(definition: FormDefinition): string {
  const locales = definition.extensions?.['x-formspec-locales'];
  if (!isRecord(locales) || !Array.isArray(locales.available)) {
    return 'English';
  }
  return locales.available
    .filter((locale): locale is string => typeof locale === 'string')
    .map((locale) => locale.toUpperCase())
    .join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
