export function getBaseSpec(schema = "vega-lite") {
  const baseProps = {
    background: null,
    autosize: {
      type: "fit",
      contains: "padding",
    },
    padding: { left: 5, right: 5, top: 10, bottom: 10 },
  };
  return {
    $schema: schema,
    ...baseProps,
  };
}

export function getBaseVegaLiteSpec() {
  return getBaseSpec("https://vega.github.io/schema/vega-lite/v6.json");
}

export function getBaseVegaSpec() {
  return getBaseSpec("https://vega.github.io/schema/vega/v6.json");
}
