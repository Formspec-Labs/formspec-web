/**
 * AUTO-GENERATED -- DO NOT EDIT
 *
 * Generated from specs/ui-policy.json by scripts/generate-ui-policy.mjs.
 * Re-run: npm run policy:generate
 */
export declare const UI_POLICY: {
    readonly $schema: "https://formspec.org/schemas/ui-policy/1.0";
    readonly version: "1.0";
    readonly description: "Machine-readable UI authoring policy shared by schema-adjacent tooling, Rust lint, TypeScript runtime helpers, and authoring tools.";
    readonly components: readonly [{
        readonly name: "Section";
        readonly primaryHint: "Section";
        readonly widgets: readonly ["Section"];
        readonly category: "layout";
    }, {
        readonly name: "Stack";
        readonly primaryHint: "Stack";
        readonly widgets: readonly ["Stack"];
        readonly category: "layout";
    }, {
        readonly name: "Grid";
        readonly primaryHint: "Grid";
        readonly widgets: readonly ["Grid"];
        readonly category: "layout";
    }, {
        readonly name: "TextInput";
        readonly primaryHint: "TextInput";
        readonly widgets: readonly ["TextInput"];
        readonly category: "input";
    }, {
        readonly name: "NumberInput";
        readonly primaryHint: "NumberInput";
        readonly widgets: readonly ["NumberInput"];
        readonly category: "input";
    }, {
        readonly name: "DatePicker";
        readonly primaryHint: "DatePicker";
        readonly widgets: readonly ["DatePicker"];
        readonly category: "input";
    }, {
        readonly name: "Select";
        readonly primaryHint: "Select";
        readonly widgets: readonly ["Select"];
        readonly category: "input";
    }, {
        readonly name: "CheckboxGroup";
        readonly primaryHint: "CheckboxGroup";
        readonly widgets: readonly ["CheckboxGroup"];
        readonly category: "input";
    }, {
        readonly name: "Toggle";
        readonly primaryHint: "Toggle";
        readonly widgets: readonly ["Toggle"];
        readonly category: "input";
    }, {
        readonly name: "FileUpload";
        readonly primaryHint: "FileUpload";
        readonly widgets: readonly ["FileUpload"];
        readonly category: "input";
    }, {
        readonly name: "Heading";
        readonly primaryHint: "Heading";
        readonly widgets: readonly ["Heading"];
        readonly category: "display";
    }, {
        readonly name: "Text";
        readonly primaryHint: "Text";
        readonly widgets: readonly ["Text"];
        readonly category: "display";
    }, {
        readonly name: "Divider";
        readonly primaryHint: "Divider";
        readonly widgets: readonly ["Divider"];
        readonly category: "display";
    }, {
        readonly name: "Card";
        readonly primaryHint: "Card";
        readonly widgets: readonly ["Card"];
        readonly category: "container";
    }, {
        readonly name: "Collapsible";
        readonly primaryHint: "Collapsible";
        readonly widgets: readonly ["Collapsible"];
        readonly category: "container";
    }, {
        readonly name: "ConditionalGroup";
        readonly primaryHint: "ConditionalGroup";
        readonly widgets: readonly ["ConditionalGroup"];
        readonly category: "container";
    }, {
        readonly name: "Tabs";
        readonly primaryHint: "Tabs";
        readonly widgets: readonly ["Tabs"];
        readonly category: "layout";
    }, {
        readonly name: "ActionButton";
        readonly primaryHint: "ActionButton";
        readonly widgets: readonly ["ActionButton"];
        readonly category: "display";
    }, {
        readonly name: "Accordion";
        readonly primaryHint: "Accordion";
        readonly widgets: readonly ["Accordion"];
        readonly category: "layout";
    }, {
        readonly name: "RadioGroup";
        readonly primaryHint: "RadioGroup";
        readonly widgets: readonly ["RadioGroup"];
        readonly category: "input";
    }, {
        readonly name: "MoneyInput";
        readonly primaryHint: "MoneyInput";
        readonly widgets: readonly ["MoneyInput"];
        readonly category: "input";
    }, {
        readonly name: "Slider";
        readonly primaryHint: "Slider";
        readonly widgets: readonly ["Slider"];
        readonly category: "input";
    }, {
        readonly name: "Rating";
        readonly primaryHint: "Rating";
        readonly widgets: readonly ["Rating"];
        readonly category: "input";
    }, {
        readonly name: "Signature";
        readonly primaryHint: "Signature";
        readonly widgets: readonly ["Signature"];
        readonly category: "input";
    }, {
        readonly name: "Alert";
        readonly primaryHint: "Alert";
        readonly widgets: readonly ["Alert"];
        readonly category: "display";
    }, {
        readonly name: "Badge";
        readonly primaryHint: "Badge";
        readonly widgets: readonly ["Badge"];
        readonly category: "display";
    }, {
        readonly name: "ProgressBar";
        readonly primaryHint: "ProgressBar";
        readonly widgets: readonly ["ProgressBar"];
        readonly category: "display";
    }, {
        readonly name: "Summary";
        readonly primaryHint: "Summary";
        readonly widgets: readonly ["Summary"];
        readonly category: "display";
    }, {
        readonly name: "ValidationSummary";
        readonly primaryHint: "ValidationSummary";
        readonly widgets: readonly ["ValidationSummary"];
        readonly category: "display";
    }, {
        readonly name: "DataTable";
        readonly primaryHint: "DataTable";
        readonly widgets: readonly ["DataTable"];
        readonly category: "display";
    }, {
        readonly name: "Panel";
        readonly primaryHint: "Panel";
        readonly widgets: readonly ["Panel"];
        readonly category: "container";
    }, {
        readonly name: "Modal";
        readonly primaryHint: "Modal";
        readonly widgets: readonly ["Modal"];
        readonly category: "container";
    }, {
        readonly name: "Popover";
        readonly primaryHint: "Popover";
        readonly widgets: readonly ["Popover"];
        readonly category: "container";
    }];
    readonly retiredComponentNames: readonly ["Page", "Columns", "Spacer"];
    readonly inputComponents: {
        readonly TextInput: {
            readonly strictDataTypes: readonly ["string", "text", "uri"];
            readonly authoringDataTypes: readonly ["integer", "decimal", "boolean", "date", "dateTime", "time", "attachment", "choice", "multiChoice", "money"];
            readonly requiresOptions: false;
        };
        readonly NumberInput: {
            readonly strictDataTypes: readonly ["integer", "decimal"];
            readonly authoringDataTypes: readonly ["money"];
            readonly requiresOptions: false;
        };
        readonly DatePicker: {
            readonly strictDataTypes: readonly ["date", "dateTime", "time"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly Select: {
            readonly strictDataTypes: readonly ["choice", "multiChoice"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: true;
        };
        readonly CheckboxGroup: {
            readonly strictDataTypes: readonly ["multiChoice"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: true;
        };
        readonly Toggle: {
            readonly strictDataTypes: readonly ["boolean"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly FileUpload: {
            readonly strictDataTypes: readonly ["attachment"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly RadioGroup: {
            readonly strictDataTypes: readonly ["choice"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: true;
        };
        readonly MoneyInput: {
            readonly strictDataTypes: readonly ["integer", "decimal", "money"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly Slider: {
            readonly strictDataTypes: readonly ["integer", "decimal"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly Rating: {
            readonly strictDataTypes: readonly ["integer", "decimal"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
        readonly Signature: {
            readonly strictDataTypes: readonly ["attachment"];
            readonly authoringDataTypes: readonly [];
            readonly requiresOptions: false;
        };
    };
    readonly compatibilityByDataType: {
        readonly string: readonly ["TextInput"];
        readonly text: readonly ["TextInput"];
        readonly decimal: readonly ["NumberInput", "MoneyInput", "Slider", "Rating"];
        readonly integer: readonly ["NumberInput", "MoneyInput", "Slider", "Rating"];
        readonly boolean: readonly ["Toggle"];
        readonly date: readonly ["DatePicker"];
        readonly dateTime: readonly ["DatePicker"];
        readonly time: readonly ["DatePicker"];
        readonly uri: readonly ["TextInput"];
        readonly choice: readonly ["Select", "RadioGroup"];
        readonly multiChoice: readonly ["CheckboxGroup", "Select"];
        readonly attachment: readonly ["FileUpload", "Signature"];
        readonly money: readonly ["MoneyInput"];
    };
    readonly fallbackPolicy: {
        readonly defaultPreserve: readonly ["bind", "when", "responsive", "style", "cssClass", "accessibility"];
        readonly preserveChildrenWhenFallbackAcceptsChildren: true;
        readonly unknownComponentSpecificProps: "drop-with-warning";
        readonly components: {
            readonly Tabs: {
                readonly fallback: "Stack";
                readonly carry: readonly ["children"];
                readonly drop: readonly ["placement", "defaultTab"];
                readonly translate: {
                    readonly tabLabels: "insert-heading-before-child";
                };
            };
            readonly Accordion: {
                readonly fallback: "Stack";
                readonly carry: readonly ["children"];
                readonly drop: readonly ["allowMultiple", "defaultOpen"];
                readonly translate: {
                    readonly labels: "collapsible-title";
                };
            };
            readonly RadioGroup: {
                readonly fallback: "Select";
                readonly carry: readonly ["bind"];
                readonly drop: readonly ["columns", "orientation"];
                readonly translate: {};
            };
            readonly MoneyInput: {
                readonly fallback: "NumberInput";
                readonly carry: readonly ["bind", "placeholder", "step", "min", "max"];
                readonly drop: readonly ["currency", "showCurrency", "locale"];
                readonly translate: {
                    readonly showCurrency: "bound-item-prefix-hint";
                };
            };
            readonly Slider: {
                readonly fallback: "NumberInput";
                readonly carry: readonly ["bind", "min", "max", "step"];
                readonly drop: readonly ["showTicks", "showValue"];
                readonly translate: {};
            };
            readonly Rating: {
                readonly fallback: "NumberInput";
                readonly carry: readonly ["bind", "max"];
                readonly drop: readonly ["icon", "allowHalf"];
                readonly translate: {
                    readonly max: "number-input-max";
                    readonly step: "constant-1";
                    readonly min: "constant-1";
                };
            };
            readonly Signature: {
                readonly fallback: "FileUpload";
                readonly carry: readonly ["bind"];
                readonly drop: readonly ["strokeColor", "height", "penWidth", "clearable"];
                readonly translate: {
                    readonly accept: "image/*";
                };
            };
            readonly Alert: {
                readonly fallback: "Text";
                readonly carry: readonly ["text"];
                readonly drop: readonly ["dismissible"];
                readonly translate: {
                    readonly severity: "prefix-text";
                };
            };
            readonly Badge: {
                readonly fallback: "Text";
                readonly carry: readonly ["text"];
                readonly drop: readonly ["variant"];
                readonly translate: {};
            };
            readonly ProgressBar: {
                readonly fallback: "Text";
                readonly carry: readonly ["bind", "value", "max"];
                readonly drop: readonly ["label", "showPercent"];
                readonly translate: {
                    readonly value: "value-max-percent-text";
                };
            };
            readonly Summary: {
                readonly fallback: "Stack";
                readonly carry: readonly ["items"];
                readonly drop: readonly [];
                readonly translate: {
                    readonly items: "text-list-label-value";
                };
            };
            readonly ValidationSummary: {
                readonly fallback: "Alert";
                readonly carry: readonly ["source", "mode", "showFieldErrors"];
                readonly drop: readonly ["jumpLinks", "dedupe"];
                readonly translate: {
                    readonly validationRows: "warning-error-alerts";
                };
            };
            readonly DataTable: {
                readonly fallback: "Stack";
                readonly carry: readonly ["bind", "columns"];
                readonly drop: readonly ["showRowNumbers", "allowAdd", "allowRemove"];
                readonly translate: {
                    readonly repeatRows: "card-per-repeat-instance";
                };
            };
            readonly Panel: {
                readonly fallback: "Card";
                readonly carry: readonly ["title", "children"];
                readonly drop: readonly ["placement", "width"];
                readonly translate: {};
            };
            readonly Modal: {
                readonly fallback: "Collapsible";
                readonly carry: readonly ["title", "children"];
                readonly drop: readonly ["size", "trigger", "triggerLabel", "closable", "headingLevel", "placement"];
                readonly translate: {
                    readonly defaultOpen: "constant-false";
                };
            };
            readonly Popover: {
                readonly fallback: "Collapsible";
                readonly carry: readonly ["children"];
                readonly drop: readonly ["triggerBind", "placement"];
                readonly translate: {
                    readonly triggerLabel: "title";
                };
            };
        };
    };
    readonly responsive: {
        readonly forbiddenKeys: readonly ["component", "bind", "when", "children", "responsive"];
        readonly baseAllowedProps: readonly ["style", "cssClass", "accessibility", "layout", "hidden", "padding", "background", "border", "radius", "elevation"];
        readonly allowedPropsByComponent: {
            readonly Section: readonly ["title", "description"];
            readonly Stack: readonly ["direction", "gap", "align", "justify", "wrap"];
            readonly Grid: readonly ["columns", "gap", "rowGap"];
            readonly Card: readonly ["title", "padding", "background", "border", "radius", "elevation"];
            readonly Panel: readonly ["title", "placement", "width", "padding", "background", "border", "radius", "elevation"];
            readonly Collapsible: readonly ["title"];
            readonly ConditionalGroup: readonly [];
            readonly Tabs: readonly ["placement"];
            readonly Accordion: readonly [];
            readonly TextInput: readonly ["placeholder", "maxLines", "inputMode", "prefix", "suffix", "variant"];
            readonly NumberInput: readonly ["placeholder", "step", "min", "max", "showStepper"];
            readonly DatePicker: readonly ["placeholder", "format", "minDate", "maxDate", "showTime"];
            readonly Select: readonly ["placeholder", "searchable", "clearable"];
            readonly CheckboxGroup: readonly ["columns", "selectAll"];
            readonly RadioGroup: readonly ["columns", "orientation"];
            readonly Toggle: readonly ["onLabel", "offLabel"];
            readonly FileUpload: readonly ["accept", "maxSize", "dragDrop"];
            readonly MoneyInput: readonly ["placeholder", "step", "min", "max", "showStepper", "currency", "showCurrency", "locale"];
            readonly Slider: readonly ["min", "max", "step", "showValue", "showTicks"];
            readonly Rating: readonly ["max", "icon", "allowHalf"];
            readonly Signature: readonly ["strokeColor", "height", "penWidth", "clearable"];
            readonly Heading: readonly ["text", "level"];
            readonly Text: readonly ["text", "format"];
            readonly Divider: readonly [];
            readonly Alert: readonly ["severity", "text", "dismissible"];
            readonly Badge: readonly ["text", "variant"];
            readonly ProgressBar: readonly ["value", "max", "label", "showPercent"];
            readonly Summary: readonly ["items"];
            readonly ValidationSummary: readonly ["showFieldErrors", "jumpLinks", "dedupe"];
            readonly DataTable: readonly ["columns", "showRowNumbers"];
            readonly Modal: readonly ["title", "size", "triggerLabel", "headingLevel", "placement"];
            readonly Popover: readonly ["triggerLabel", "placement"];
            readonly ActionButton: readonly ["actionRef", "label", "pendingLabel"];
        };
    };
    readonly breakpoints: {
        readonly sameNameValuesMustMatch: true;
    };
    readonly pagePrecedence: {
        readonly order: readonly ["componentDirectRootSections", "themePages", "definitionFallback"];
        readonly shadowedThemePagesDiagnostic: "W805";
        readonly conflictingAssignmentDiagnostic: "E805";
        readonly mergePolicy: "do-not-merge-competing-page-structures";
    };
    readonly attention: {
        readonly sources: readonly ["requiredIncomplete", "validationError", "authoringWarning", "unsupportedProgressiveFallback"];
        readonly defaultSeverityOrder: readonly ["error", "warning", "info"];
        readonly authoringSurface: "lint-diagnostics-first";
    };
    readonly extensionDiscovery: {
        readonly rootAnnotationPrefix: "x-";
        readonly semanticExtensionProperty: "extensions";
        readonly registryDocumentContext: "registryDocuments";
        readonly unknownRootAnnotationSemantics: "annotation-only";
    };
    readonly tokens: {
        readonly customTokenPrefixes: readonly ["x-"];
        readonly unknownNonExtensionDiagnostic: "W708";
        readonly platformDefaultDiagnostic: "W709";
    };
};
export type UiPolicy = typeof UI_POLICY;
