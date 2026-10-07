/** @filedesc Pure authored StructuredPanel configuration schemas; channels and native evidence remain separate. */
/** Reusable branch for authored Registry widgetShape.props; not native admission. */
export declare const STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["type", "id", "path", "emptyMessage", "unavailableMessage", "x-generation"];
    readonly properties: {
        readonly type: {
            readonly const: "json";
        };
        readonly id: {
            readonly type: "string";
            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
        };
        readonly path: {
            readonly type: "string";
            readonly pattern: "^[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
        };
        readonly title: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly emptyMessage: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly unavailableMessage: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly 'x-generation': {
            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
        };
    };
};
/**
 * Whole static panel configuration for Registry widgetShape.props. Named data
 * inputs and action outputs remain owner declarations outside this schema.
 * Need resolution, source admission and channel readiness remain separate checks.
 * The existing JSON branch keeps its stricter required copy and trace fields.
 */
export declare const STRUCTURED_PANEL_CONFIG_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly emptyWhen: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly required: readonly ["inputName"];
            readonly properties: {
                readonly inputName: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly path: {
                    readonly anyOf: readonly [{
                        readonly const: "";
                    }, {
                        readonly type: "string";
                        readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                    }];
                };
            };
        };
        readonly stateViews: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly loading: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly actions: {
                            readonly type: "array";
                            readonly items: {
                                readonly oneOf: readonly [{
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "label"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "retry";
                                        };
                                        readonly label: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }, {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "outputName"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "output";
                                        };
                                        readonly outputName: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }];
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly heading: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly body: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
                readonly empty: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly actions: {
                            readonly type: "array";
                            readonly items: {
                                readonly oneOf: readonly [{
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "label"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "retry";
                                        };
                                        readonly label: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }, {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "outputName"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "output";
                                        };
                                        readonly outputName: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }];
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly heading: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly body: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
                readonly unavailable: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly actions: {
                            readonly type: "array";
                            readonly items: {
                                readonly oneOf: readonly [{
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "label"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "retry";
                                        };
                                        readonly label: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }, {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "outputName"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "output";
                                        };
                                        readonly outputName: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }];
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly heading: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly body: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
                readonly error: {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly actions: {
                            readonly type: "array";
                            readonly items: {
                                readonly oneOf: readonly [{
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "label"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "retry";
                                        };
                                        readonly label: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }, {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["kind", "outputName"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly kind: {
                                            readonly const: "output";
                                        };
                                        readonly outputName: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly emphasis: {
                                            readonly enum: readonly ["primary", "secondary", "danger"];
                                        };
                                    };
                                }];
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly heading: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly body: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                };
            };
        };
        readonly actions: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly required: readonly ["outputName"];
                readonly properties: {
                    readonly order: {
                        readonly type: "number";
                    };
                    readonly 'x-generation': {
                        readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                    };
                    readonly outputName: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly emphasis: {
                        readonly enum: readonly ["primary", "secondary", "danger"];
                    };
                    readonly payload: {
                        readonly type: "object";
                        readonly propertyNames: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly additionalProperties: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly required: readonly ["path"];
                            readonly properties: {
                                readonly path: {
                                    readonly anyOf: readonly [{
                                        readonly const: "";
                                    }, {
                                        readonly type: "string";
                                        readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                                    }];
                                };
                            };
                        };
                    };
                    readonly pendingLabel: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly successMessage: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly failureMessage: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly confirmation: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly required: readonly ["heading", "body", "confirmLabel", "cancelLabel"];
                        readonly properties: {
                            readonly 'x-generation': {
                                readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                            };
                            readonly heading: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly body: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly confirmLabel: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                            readonly cancelLabel: {
                                readonly type: "string";
                                readonly minLength: 1;
                            };
                        };
                    };
                };
            };
        };
        readonly blocks: {
            readonly type: "array";
            readonly items: {
                readonly oneOf: readonly [{
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "path"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "metric";
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly label: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly prefix: {
                            readonly type: "string";
                        };
                        readonly suffix: {
                            readonly type: "string";
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "items"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "key-value";
                        };
                        readonly items: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly required: readonly ["id", "label"];
                                readonly properties: {
                                    readonly 'x-generation': {
                                        readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                    };
                                    readonly id: {
                                        readonly type: "string";
                                        readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                                    };
                                    readonly label: {
                                        readonly type: "string";
                                        readonly minLength: 1;
                                    };
                                    readonly path: {
                                        readonly type: "string";
                                        readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                                    };
                                    readonly routeParam: {
                                        readonly type: "string";
                                        readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                                    };
                                };
                                readonly oneOf: readonly [{
                                    readonly required: readonly ["path"];
                                }, {
                                    readonly required: readonly ["routeParam"];
                                }];
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "path"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "list";
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly itemPath: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly ordered: {
                            readonly type: "boolean";
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "path", "columns"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "table";
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly caption: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly responsiveMode: {
                            readonly enum: readonly ["stack", "scroll"];
                        };
                        readonly columns: {
                            readonly type: "array";
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly required: readonly ["id", "label", "path"];
                                readonly properties: {
                                    readonly 'x-generation': {
                                        readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                    };
                                    readonly id: {
                                        readonly type: "string";
                                        readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                                    };
                                    readonly label: {
                                        readonly type: "string";
                                        readonly minLength: 1;
                                    };
                                    readonly path: {
                                        readonly type: "string";
                                        readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                                    };
                                    readonly numeric: {
                                        readonly type: "boolean";
                                    };
                                };
                            };
                        };
                        readonly rowAction: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly required: readonly ["outputName", "columnLabel"];
                            readonly properties: {
                                readonly columnLabel: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly 'x-generation': {
                                    readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                };
                                readonly outputName: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly emphasis: {
                                    readonly enum: readonly ["primary", "secondary", "danger"];
                                };
                                readonly payload: {
                                    readonly type: "object";
                                    readonly propertyNames: {
                                        readonly type: "string";
                                        readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                                    };
                                    readonly additionalProperties: {
                                        readonly type: "object";
                                        readonly additionalProperties: false;
                                        readonly required: readonly ["path"];
                                        readonly properties: {
                                            readonly path: {
                                                readonly anyOf: readonly [{
                                                    readonly const: "";
                                                }, {
                                                    readonly type: "string";
                                                    readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                                                }];
                                            };
                                        };
                                    };
                                };
                                readonly pendingLabel: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly successMessage: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly failureMessage: {
                                    readonly type: "string";
                                    readonly minLength: 1;
                                };
                                readonly confirmation: {
                                    readonly type: "object";
                                    readonly additionalProperties: false;
                                    readonly required: readonly ["heading", "body", "confirmLabel", "cancelLabel"];
                                    readonly properties: {
                                        readonly 'x-generation': {
                                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                                        };
                                        readonly heading: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly body: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly confirmLabel: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                        readonly cancelLabel: {
                                            readonly type: "string";
                                            readonly minLength: 1;
                                        };
                                    };
                                };
                            };
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "path"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "progress";
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly label: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly max: {
                            readonly type: "number";
                        };
                        readonly maxPath: {
                            readonly type: "string";
                            readonly pattern: "^(?!.*(?:^|\\.)(?:__proto__|prototype|constructor)(?:\\.|$))[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly suffix: {
                            readonly type: "string";
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                    };
                }, {
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly required: readonly ["type", "id", "path", "emptyMessage", "unavailableMessage", "x-generation"];
                    readonly properties: {
                        readonly type: {
                            readonly const: "json";
                        };
                        readonly id: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
                        };
                        readonly path: {
                            readonly type: "string";
                            readonly pattern: "^[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)*$";
                        };
                        readonly title: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly emptyMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly unavailableMessage: {
                            readonly type: "string";
                            readonly minLength: 1;
                        };
                        readonly 'x-generation': {
                            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
                        };
                    };
                }];
            };
        };
        readonly 'x-generation': {
            readonly $ref: "https://formspec.org/schemas/common/1.0#/$defs/Generation";
        };
        readonly id: {
            readonly type: "string";
            readonly pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$";
        };
        readonly eyebrow: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly state: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly title: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly body: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly emptyMessage: {
            readonly type: "string";
            readonly minLength: 1;
        };
    };
};
