import { createStripPlotSpec } from "../specs/commit-strip-plot-vega.js";
import { applyDaisyUITheme } from "../themes/daisyui.js";

/**
 * Render strip plot visualization in a container
 * @param {HTMLElement} container - DOM container element
 * @param {Object} data - Visualization data (single period or comparison)
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} - Vega view instance
 */
export async function renderStripPlot(container, data, options = {}) {
  if (!container) {
    throw new Error("Container element is required");
  }

  container.innerHTML = "";

  const defaultOptions = {
    width: container.clientWidth || 800,
    height: options.height || 400,
    theme: "auto",
    responsive: false, // Disable responsive to prevent resize loops
    showTooltips: false, // Disable tooltips initially
    ...options,
  };

  const spec = createStripPlotSpec(data, defaultOptions);

  try {
    // Create Vega view without hover (which was causing the update loop)
    const view = new vega.View(vega.parse(spec))
      .renderer("canvas")
      .initialize(container);
    // .hover() removed - this was the culprit!

    // Run once
    await view.runAsync();

    // Store view reference for cleanup
    container._vegaView = view;

    // Optionally add safe interactions later
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

/**
 * Add tooltips without causing update loops
 */
function addSafeTooltips(view, container) {
  // We can add custom tooltip handling here if needed
  // without using Vega's built-in hover system
}

/**
 * Apply theme to the Vega specification
 * @param {Object} spec - Vega specification
 * @param {Object} options - Theme options
 * @returns {Object} - Themed specification
 */
export function applyTheme(spec, options = {}) {
  const isDarkMode = detectDarkMode(options.theme);

  // Use existing DaisyUI theme if available, otherwise create custom theme
  if (typeof applyDaisyUITheme === "function") {
    return applyDaisyUITheme(spec, { isDark: isDarkMode });
  }

  // Fallback custom theme
  return applyCustomTheme(spec, isDarkMode);
}

/**
 * Apply custom theme when DaisyUI theme is not available
 * @param {Object} spec - Vega specification
 * @param {boolean} isDark - Whether to use dark theme
 * @returns {Object} - Themed specification
 */
function applyCustomTheme(spec, isDark) {
  const themeColors = isDark
    ? {
        background: "#1f2937",
        text: "#e5e7eb",
        gridColor: "rgba(255,255,255,0.1)",
        axisColor: "rgba(229,231,235,0.7)",
      }
    : {
        background: "#ffffff",
        text: "#333333",
        gridColor: "rgba(0,0,0,0.05)",
        axisColor: "rgba(51,51,51,0.7)",
      };

  return {
    ...spec,
    background: themeColors.background,
    config: {
      ...(spec.config || {}),
      axis: {
        ...((spec.config && spec.config.axis) || {}),
        gridColor: themeColors.gridColor,
        gridOpacity: 1,
        domainColor: themeColors.axisColor,
        tickColor: themeColors.axisColor,
        labelColor: themeColors.text,
        titleColor: themeColors.text,
      },
      legend: {
        ...((spec.config && spec.config.legend) || {}),
        labelColor: themeColors.text,
        titleColor: themeColors.text,
      },
      title: {
        ...((spec.config && spec.config.title) || {}),
        color: themeColors.text,
      },
    },
  };
}

/**
 * Detect dark mode based on theme option or system preference
 * @param {string} theme - Theme preference ('light', 'dark', 'auto')
 * @returns {boolean} - Whether dark mode should be used
 */
function detectDarkMode(theme = "auto") {
  if (theme === "dark") return true;
  if (theme === "light") return false;

  // Auto-detect from DOM or system preference
  if (
    document.documentElement.classList.contains("dark") ||
    document.documentElement.getAttribute("data-theme") === "dark"
  ) {
    return true;
  }

  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return true;
  }

  return false;
}

/**
 * Setup responsive behavior for the visualization
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 * @param {Object} spec - Original specification
 */
function setupResponsiveBehavior(view, container, spec) {
  let resizeTimer;

  const handleResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;

      if (newWidth > 0 && newHeight > 0) {
        view.width(newWidth).height(newHeight).run();
      }
    }, 250);
  };

  // Create ResizeObserver if available, otherwise fall back to window resize
  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Store observer for cleanup
    container._resizeObserver = resizeObserver;
  } else {
    window.addEventListener("resize", handleResize);
    container._resizeHandler = handleResize;
  }
}

/**
 * Setup tooltip functionality
 * @param {Object} view - Vega view instance
 * @param {HTMLElement} container - Container element
 */
function setupTooltips(view, container) {
  // Create tooltip element
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

  // Tooltip event handlers
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

  // Store tooltip for cleanup
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

  // Repository info
  if (datum.repo) {
    parts.push(`<strong>Repository:</strong> ${datum.repo.split("/").pop()}`);
  }

  // Date and time
  if (datum.date && datum.timeOfDay) {
    const date = new Date(datum.dayTimestamp).toLocaleDateString();
    const time = new Date(datum.timeOfDay).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    parts.push(`<strong>Date:</strong> ${date}`);
    parts.push(`<strong>Time:</strong> ${time}`);
  }

  // Commit size
  if (typeof datum.commitSize === "number") {
    parts.push(`<strong>Lines Changed:</strong> ${datum.commitSize}`);
  }

  // Special indicators
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

  // Double-click handler for cluster highlighting
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

  // Zoom functionality could be added here if needed
  if (defaultOptions.enableZoom) {
    // Implementation for zoom/pan functionality
  }
}

/**
 * Cleanup visualization resources
 * @param {HTMLElement} container - Container element
 */
export function cleanup(container) {
  if (!container) return;

  // Cleanup Vega view
  if (container._vegaView) {
    container._vegaView.finalize();
    container._vegaView = null;
  }

  // Cleanup tooltip
  if (container._tooltip && container._tooltip.parentNode) {
    container._tooltip.parentNode.removeChild(container._tooltip);
    container._tooltip = null;
  }

  // Cleanup resize observer
  if (container._resizeObserver) {
    container._resizeObserver.disconnect();
    container._resizeObserver = null;
  }

  // Cleanup resize handler
  if (container._resizeHandler) {
    window.removeEventListener("resize", container._resizeHandler);
    container._resizeHandler = null;
  }

  // Clear container
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
  // Cleanup existing visualization
  cleanup(container);

  // Render with new data
  return await renderStripPlot(container, newData, options);
}
