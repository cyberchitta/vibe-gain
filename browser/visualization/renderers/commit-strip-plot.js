import { createStripPlotSpec } from "../specs/commit-strip-plot-vega.js";
import { applyDaisyUITheme } from "../themes/daisyui.js";

export async function renderStripPlot(container, data, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }
  container.innerHTML = "";
  const defaultOptions = {
    width: container.clientWidth || 800,
    height: options.height || 400,
    responsive: false,
    showTooltips: false,
    ...options,
  };
  const spec = createStripPlotSpec(data, defaultOptions);
  try {
    const view = new vega.View(vega.parse(spec))
      .renderer("canvas")
      .initialize(container);
    await view.runAsync();
    container._vegaView = view;
    if (defaultOptions.showTooltips) {
      addSafeTooltips(view, container);
    }
    return view;
  } catch (error) {
    console.error("Error rendering strip plot:", error);
    container.innerHTML = `<div class="error-message p-4 text-error">Error: ${error.message}</div>`;
    throw error;
  }
}

// Remove applyTheme, applyCustomTheme, detectDarkMode functions - they're now in themes/daisyui.js

// Keep the rest of the utility functions (addSafeTooltips, etc.)

/**
 * Add tooltips without causing update loops
 */
function addSafeTooltips(view, container) {
  // We can add custom tooltip handling here if needed
  // without using Vega's built-in hover system
}

/**
 * Setup tooltip functionality
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 */
function setupTooltips(view, container) {
  const tooltip = document.createElement("div");
  tooltip.className = "vega-tooltip";
  tooltip.style.cssText = `
    position: absolute;
    z-index: 1000;
    background: var(--base-200, #f3f4f6);
    color: var(--base-content, #333333);
    border: 1px solid var(--base-300, #d1d5db);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  `;
  document.body.appendChild(tooltip);
  view.addEventListener("mouseover", (event, item) => {
    if (item && item.datum) {
      const content = formatTooltipContent(item.datum);
      if (content) {
        tooltip.innerHTML = content;
        tooltip.style.opacity = "1";
        positionTooltip(tooltip, event);
      }
    }
  });
  view.addEventListener("mousemove", (event, item) => {
    if (tooltip.style.opacity === "1") {
      positionTooltip(tooltip, event);
    }
  });
  view.addEventListener("mouseout", () => {
    tooltip.style.opacity = "0";
  });
  container._tooltip = tooltip;
}

/**
 * Position tooltip relative to mouse cursor
 * @param {HTMLElement} tooltip - Tooltip element
 * @param {Object} event - Mouse event
 */
function positionTooltip(tooltip, event) {
  const x = Math.min(
    event.clientX + 10,
    window.innerWidth - tooltip.offsetWidth - 10
  );
  const y = Math.min(
    event.clientY - tooltip.offsetHeight - 10,
    window.innerHeight - tooltip.offsetHeight - 10
  );
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

/**
 * Format tooltip content for commit data
 * @param {Object} datum - Data point from visualization
 * @returns {string} - HTML content for tooltip
 */
function formatTooltipContent(datum) {
  if (!datum) return "";
  const parts = [];
  if (datum.repo) {
    parts.push(`<strong>Repository:</strong> ${datum.repo.split("/").pop()}`);
  }
  if (datum.date && datum.timeOfDay) {
    const date = new Date(datum.dayTimestamp).toLocaleDateString();
    const time = new Date(datum.timeOfDay).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    parts.push(`<strong>Date:</strong> ${date}`);
    parts.push(`<strong>Time:</strong> ${time}`);
  }
  if (typeof datum.commitSize === "number") {
    parts.push(`<strong>Lines Changed:</strong> ${datum.commitSize}`);
  }
  if (datum.isDocOnly) {
    parts.push(`<strong>Type:</strong> Documentation Only`);
  }
  if (datum.clusterId) {
    parts.push(`<strong>Cluster:</strong> ${datum.clusterId}`);
  }
  return parts.join("<br>");
}

/**
 * Setup interaction handlers for the visualization
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 * @param {Object} data - Visualization data
 */
function setupInteractionHandlers(view, container, data) {
  // Click handler for commit selection
  view.addEventListener("click", (event, item) => {
    if (item && item.datum) {
      // Emit custom event for external handling
      const customEvent = new CustomEvent("commitSelected", {
        detail: {
          commit: item.datum,
          period: data.period || "unknown",
        },
      });
      container.dispatchEvent(customEvent);
    }
  });
  view.addEventListener("dblclick", (event, item) => {
    if (item && item.datum && item.datum.clusterId) {
      highlightCluster(view, item.datum.clusterId);
    }
  });
}

/**
 * Highlight all commits in a specific cluster
 * @param {Object} view - Vega view instance
 * @param {string} clusterId - ID of cluster to highlight
 */
function highlightCluster(view, clusterId) {
  // This would require additional Vega signals and transforms
  // For now, we'll emit an event that can be handled externally
  view.signal("highlightCluster", clusterId);
  view.run();
}

/**
 * Handle resize of visualization
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 */
export function handleResize(view, container) {
  if (!view || !container) return;
  const newWidth = container.clientWidth;
  const newHeight = container.clientHeight;
  if (newWidth > 0 && newHeight > 0) {
    view.width(newWidth).height(newHeight).run();
  }
}

/**
 * Add interactivity to existing visualization
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Interaction options
 */
export function addInteractivity(view, container, options = {}) {
  const defaultOptions = {
    enableTooltips: true,
    enableSelection: true,
    enableZoom: false,
    ...options,
  };
  if (defaultOptions.enableTooltips && !container._tooltip) {
    setupTooltips(view, container);
  }
  if (defaultOptions.enableSelection) {
    setupInteractionHandlers(view, container, {});
  }
  if (defaultOptions.enableZoom) {
  }
}

/**
 * Cleanup visualization resources
 * @param {HTMLElement} container - Container element
 */
export function cleanup(container) {
  if (!container) return;
  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }
  if (container._tooltip && container._tooltip.parentNode) {
    container._tooltip.parentNode.removeChild(container._tooltip);
    container._tooltip = null;
  }
  if (container._resizeObserver) {
    container._resizeObserver.disconnect();
    container._resizeObserver = null;
  }
  if (container._resizeHandler) {
    window.removeEventListener("resize", container._resizeHandler);
    container._resizeHandler = null;
  }
  container.innerHTML = "";
}

/**
 * Refresh visualization with new data
 * @param {HTMLElement} container - Container element
 * @param {Object} newData - New visualization data
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - New Vega view instance
 */
export async function refreshVisualization(container, newData, options = {}) {
  cleanup(container);
  return await renderStripPlot(container, newData, options);
}
