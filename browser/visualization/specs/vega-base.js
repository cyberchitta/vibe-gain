/**
 * Create a base Vega-Lite specification
 * @returns {Object} - Base Vega-Lite specification
 */
export function createBaseVegaSpec() {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: null,
    autosize: {
      type: 'fit-x',
      contains: 'padding'
    },
    padding: { left: 10, right: 10, top: 5, bottom: 20 }
  };
}