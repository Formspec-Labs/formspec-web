const assignmentPattern =
  /^window\.__FORMSPEC_RUNTIME_CONFIG__ = JSON\.parse\((.*)\);\s*$/su;

export function parseRuntimeConfigScript(source) {
  const match = assignmentPattern.exec(source);
  if (!match) {
    throw new Error('runtime config does not use the expected JSON.parse assignment');
  }

  try {
    const serializedConfig = JSON.parse(match[1]);
    const config = JSON.parse(serializedConfig);
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new Error('runtime config value is not an object');
    }
    return config;
  } catch (error) {
    throw new Error('runtime config assignment does not contain valid JSON', {
      cause: error,
    });
  }
}
