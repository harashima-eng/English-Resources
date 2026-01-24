/**
 * Annotation Module - GoodNotes-quality drawing for HTML pages
 * Optimized for iPad + Apple Pencil with pressure sensitivity
 */

(function() {
  'use strict';

  // ========== Configuration ==========
  const CONFIG = {
    tools: {
      pen: { minWidth: 1, maxWidth: 6, opacity: 1 },
      highlighter: { minWidth: 15, maxWidth: 25, opacity: 0.35 },
      eraser: { radius: 20 }
    },
    colors: ['#1a1a1a', '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'],
    palmRejectRadius: 20,
    saveDebounce: 500,
    minPointDistance: 2,    // Minimum pixels between points (jitter filter)
    velocityWeight: 0.3,    // How much velocity affects width (0-1)
    maxVelocity: 1000       // Pixels per second for minimum width
  };

  // ========== State ==========
  let state = {
    isDrawMode: false,
    currentTool: 'pen',
    currentColor: CONFIG.colors[0],
    strokes: [],
    currentStroke: null,
    canvas: null,
    ctx: null,
    dpr: 1,
    sizeMultiplier: 1,  // Size: XS=0.3, S=0.6, M=1, L=1.5, XL=2
    rulerStart: null,   // Starting point for ruler tool
    rulerEnabled: false,      // Ruler toggle (works with pen/highlighter)
    lastPointTime: 0,         // Timestamp for velocity calculation
    // Selection tool state
    selectionStart: null,
    selectionRect: null,
    selectedStrokes: [],
    isDraggingSelection: false,
    isResizingSelection: false,
    resizeHandle: null,
    dragOffset: { x: 0, y: 0 },
    originalBounds: null,  // For resize calculations
    // Per-view annotation storage
    currentViewId: null,
    strokesByView: {}
  };

  // ========== Initialization ==========
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  function setup() {
    createCanvas();
    createToolbar();
    initViewTracking();
    loadAnnotations();
    setupResizeHandler();
    setupScrollHandler();
    setupViewChangeListener();
    setupViewportHandler();
  }

  // ========== View Tracking ==========
  function getCurrentViewId() {
    const activeView = document.querySelector('.view.active');
    return activeView ? activeView.id : 'default';
  }

  function initViewTracking() {
    state.currentViewId = getCurrentViewId();
  }

  function setupViewChangeListener() {
    // Watch for class changes on any .view element
    const views = document.querySelectorAll('.view');
    if (views.length === 0) return; // No view system on this page

    const observer = new MutationObserver(() => {
      // CRITICAL: Don't switch views during active drawing - prevents crash
      if (state.currentStroke) return;

      try {
        const newViewId = getCurrentViewId();
        if (newViewId !== state.currentViewId) {
          // Save current strokes to the old view
          state.strokesByView[state.currentViewId] = state.strokes;

          // Switch to new view
          state.currentViewId = newViewId;

          // Load strokes for the new view
          state.strokes = state.strokesByView[newViewId] || [];

          // Redraw canvas with new view's strokes
          redrawAllStrokes();
        }
      } catch (err) {
        console.error('View change error:', err);
      }
    });

    views.forEach(view => {
      observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // ========== Canvas Setup ==========
  function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'annotation-canvas';
    // Position and size will be set by repositionCanvas()
    canvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9998;
      touch-action: none;
    `;
    document.body.appendChild(canvas);
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { willReadFrequently: false });

    repositionCanvas();
  }

  function resizeCanvas() {
    const canvas = state.canvas;
    const vv = window.visualViewport;
    state.dpr = window.devicePixelRatio || 1;

    // Use visual viewport dimensions (what user actually sees)
    const cssWidth = vv ? vv.width : window.innerWidth;
    const cssHeight = vv ? vv.height : window.innerHeight;

    // Set internal resolution (device pixels) for crisp Retina rendering
    canvas.width = cssWidth * state.dpr;
    canvas.height = cssHeight * state.dpr;

    // Set CSS size explicitly to match internal resolution
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    // Reset and scale context so drawing commands use CSS coordinates
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(state.dpr, state.dpr);
    redrawAllStrokes();
  }

  /**
   * Position canvas at visual viewport top-left.
   * This makes the canvas follow pinch-zoom/scroll so strokes stay on screen.
   */
  function repositionCanvas() {
    const canvas = state.canvas;
    const vv = window.visualViewport;

    if (!vv) {
      // Fallback for browsers without Visual Viewport API
      canvas.style.left = '0px';
      canvas.style.top = '0px';
      resizeCanvas();
      return;
    }

    // Position canvas at visual viewport top-left
    canvas.style.left = vv.offsetLeft + 'px';
    canvas.style.top = vv.offsetTop + 'px';

    // Resize if dimensions changed significantly
    const newWidth = vv.width;
    const newHeight = vv.height;
    const currentWidth = parseFloat(canvas.style.width) || 0;
    const currentHeight = parseFloat(canvas.style.height) || 0;

    if (Math.abs(newWidth - currentWidth) > 1 || Math.abs(newHeight - currentHeight) > 1) {
      resizeCanvas();
    } else {
      redrawAllStrokes();
    }
  }

  function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    });
  }

  function setupScrollHandler() {
    // With visual-viewport-space architecture, scroll is handled by
    // setupViewportHandler() via visualViewport.scroll event.
    // This handler is kept for browsers without Visual Viewport API.
    if (window.visualViewport) return;

    let scrollRAF = null;
    window.addEventListener('scroll', () => {
      if (scrollRAF) return;
      scrollRAF = requestAnimationFrame(() => {
        redrawAllStrokes();
        scrollRAF = null;
      });
    }, { passive: true });
  }

  function setupViewportHandler() {
    // Track pinch-zoom on iPad using Visual Viewport API
    if (!window.visualViewport) return;

    let viewportRAF = null;
    function handleViewportChange() {
      if (viewportRAF) return;
      viewportRAF = requestAnimationFrame(() => {
        repositionCanvas();   // Move canvas to follow visual viewport
        repositionToolbar();  // Keep toolbar visible during pinch-zoom
        viewportRAF = null;
      });
    }

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    // Initial positioning
    repositionCanvas();
  }

  /**
   * Repositions toolbar to stay visible during pinch-zoom.
   * CSS position:fixed is relative to layout viewport, not visual viewport,
   * so we manually position based on visualViewport offset and scale.
   */
  function repositionToolbar() {
    const toolbar = document.getElementById('annotation-toolbar');
    if (!toolbar) return;

    const vv = window.visualViewport;
    if (!vv || vv.scale === 1) {
      // Reset to CSS defaults when not zoomed
      toolbar.style.transform = '';
      toolbar.style.left = '24px';
      toolbar.style.top = '';
      toolbar.style.right = '';
      toolbar.style.bottom = '24px';
      return;
    }

    // Maintain 24px visual padding at current zoom
    const padding = 24;

    // Position at bottom-left of VISUAL viewport
    toolbar.style.right = '';
    toolbar.style.bottom = 'auto';
    toolbar.style.left = (vv.offsetLeft + padding) + 'px';
    toolbar.style.top = (vv.offsetTop + vv.height - toolbar.offsetHeight - padding) + 'px';

    // Counter-scale to maintain visual size
    toolbar.style.transform = `scale(${1 / vv.scale})`;
    toolbar.style.transformOrigin = 'bottom left';
  }

  // ========== SVG Icons ==========
  function createSVG(pathD, size = 24) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  // ========== Toolbar ==========
  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'annotation-toolbar';

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ann-btn ann-toggle';
    toggleBtn.dataset.action = 'toggle';
    toggleBtn.title = 'Toggle Draw Mode';
    toggleBtn.appendChild(createSVG('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'));
    toolbar.appendChild(toggleBtn);

    // Tools container
    const tools = document.createElement('div');
    tools.className = 'ann-tools';
    tools.style.display = 'none';

    // Pen button
    const penBtn = document.createElement('button');
    penBtn.className = 'ann-btn active';
    penBtn.dataset.tool = 'pen';
    penBtn.title = 'Pen';
    penBtn.appendChild(createSVG('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z', 20));
    tools.appendChild(penBtn);

    // Highlighter button
    const highlightBtn = document.createElement('button');
    highlightBtn.className = 'ann-btn';
    highlightBtn.dataset.tool = 'highlighter';
    highlightBtn.title = 'Highlighter';
    highlightBtn.appendChild(createSVG('M4 19h16v2H4v-2zm3-4h2v3H7v-3zm4-3h2v6h-2v-6zm4-3h2v9h-2V9zm4-3h2v12h-2V6z', 20));
    tools.appendChild(highlightBtn);

    // Eraser button
    const eraserBtn = document.createElement('button');
    eraserBtn.className = 'ann-btn';
    eraserBtn.dataset.tool = 'eraser';
    eraserBtn.title = 'Eraser';
    eraserBtn.appendChild(createSVG('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', 20));
    tools.appendChild(eraserBtn);

    // Ruler toggle button (works with pen AND highlighter)
    const rulerBtn = document.createElement('button');
    rulerBtn.className = 'ann-btn';
    rulerBtn.dataset.toggle = 'ruler';
    rulerBtn.title = 'Ruler toggle (straight line for pen/highlighter)';
    rulerBtn.appendChild(createSVG('M3 5v14h2V5H3zm4 0v14h1V5H7zm3 0v14h1V5h-1zm3 0v14h1V5h-1zm3 0v14h2V5h-2zm4 0v14h2V5h-2z', 20));
    tools.appendChild(rulerBtn);

    // Select button
    const selectBtn = document.createElement('button');
    selectBtn.className = 'ann-btn';
    selectBtn.dataset.tool = 'select';
    selectBtn.title = 'Select & Move';
    selectBtn.appendChild(createSVG('M3 3h8v2H5v6H3V3zm18 0v8h-2V5h-6V3h8zM3 13v8h8v-2H5v-6H3zm18 0v6h-6v2h8v-8h-2z', 20));
    tools.appendChild(selectBtn);

    // Divider
    const divider1 = document.createElement('div');
    divider1.className = 'ann-divider';
    tools.appendChild(divider1);

    // Colors
    const colorsContainer = document.createElement('div');
    colorsContainer.className = 'ann-colors';
    CONFIG.colors.forEach((color, i) => {
      const colorBtn = document.createElement('button');
      colorBtn.className = 'ann-color' + (i === 0 ? ' active' : '');
      colorBtn.dataset.color = color;
      colorBtn.style.background = color;
      colorsContainer.appendChild(colorBtn);
    });
    tools.appendChild(colorsContainer);

    // Divider
    const divider2 = document.createElement('div');
    divider2.className = 'ann-divider';
    tools.appendChild(divider2);

    // Size presets
    const sizesContainer = document.createElement('div');
    sizesContainer.className = 'ann-sizes';
    const sizes = [
      { label: 'XS', mult: 0.3 },
      { label: 'S', mult: 0.6 },
      { label: 'M', mult: 1 },
      { label: 'L', mult: 1.5 },
      { label: 'XL', mult: 2 }
    ];
    sizes.forEach((size, i) => {
      const btn = document.createElement('button');
      btn.className = 'ann-size' + (i === 2 ? ' active' : ''); // M is default
      btn.dataset.size = size.mult;
      btn.textContent = size.label;
      sizesContainer.appendChild(btn);
    });
    tools.appendChild(sizesContainer);

    // Divider
    const divider3 = document.createElement('div');
    divider3.className = 'ann-divider';
    tools.appendChild(divider3);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ann-btn';
    clearBtn.dataset.action = 'clear';
    clearBtn.title = 'Clear (hold 1.5s for ALL sections)';
    clearBtn.appendChild(createSVG('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z', 20));
    tools.appendChild(clearBtn);

    toolbar.appendChild(tools);
    document.body.appendChild(toolbar);

    setupToolbarEvents(toolbar);

    // Initial positioning (handles case where page loads while zoomed)
    repositionToolbar();
  }

  function setupToolbarEvents(toolbar) {
    // Long-press handler for clear button (clear ALL sections)
    let clearPressTimer = null;
    let didLongPress = false;
    const clearBtn = toolbar.querySelector('[data-action="clear"]');

    if (clearBtn) {
      clearBtn.addEventListener('pointerdown', () => {
        didLongPress = false;
        clearPressTimer = setTimeout(() => {
          didLongPress = true;
          // Long press = clear ALL views for this file
          if (confirm('Clear ALL annotations for ALL sections?')) {
            state.strokes = [];
            state.strokesByView = {};
            localforage.removeItem(getStorageKey());
            redrawAllStrokes();
          }
        }, 1500);
      });

      clearBtn.addEventListener('pointerup', () => {
        clearTimeout(clearPressTimer);
      });

      clearBtn.addEventListener('pointerleave', () => {
        clearTimeout(clearPressTimer);
      });
    }

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-tool], [data-toggle], [data-color], [data-size]');
      if (!btn) return;

      if (btn.dataset.action === 'toggle') {
        toggleDrawMode();
      } else if (btn.dataset.action === 'clear') {
        // Skip if long-press already handled it
        if (didLongPress) {
          didLongPress = false;
          return;
        }
        // Short click = only clear current view's strokes
        state.strokes = [];
        state.strokesByView[state.currentViewId] = [];
        redrawAllStrokes();
        saveAnnotations();
      } else if (btn.dataset.tool) {
        // Clear selection when switching away from select tool
        if (state.currentTool === 'select' && btn.dataset.tool !== 'select') {
          state.selectionRect = null;
          state.selectedStrokes = [];
          state.selectionStart = null;
          redrawAllStrokes();
        }
        state.currentTool = btn.dataset.tool;
        toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else if (btn.dataset.color) {
        state.currentColor = btn.dataset.color;
        toolbar.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else if (btn.dataset.size) {
        state.sizeMultiplier = parseFloat(btn.dataset.size);
        toolbar.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else if (btn.dataset.toggle === 'ruler') {
        // Toggle ruler mode on/off
        state.rulerEnabled = !state.rulerEnabled;
        btn.classList.toggle('active', state.rulerEnabled);
      }
    });
  }

  // ========== Draw Mode ==========
  function toggleDrawMode() {
    state.isDrawMode = !state.isDrawMode;
    const toolbar = document.getElementById('annotation-toolbar');
    const tools = toolbar.querySelector('.ann-tools');
    const toggle = toolbar.querySelector('.ann-toggle');

    state.canvas.style.pointerEvents = state.isDrawMode ? 'auto' : 'none';
    tools.style.display = state.isDrawMode ? 'flex' : 'none';
    toggle.classList.toggle('active', state.isDrawMode);

    if (state.isDrawMode) {
      setupDrawingEvents();
    } else {
      removeDrawingEvents();
    }
  }

  // ========== Drawing Events ==========
  let boundPointerDown, boundPointerMove, boundPointerUp;

  function setupDrawingEvents() {
    boundPointerDown = handlePointerDown.bind(this);
    boundPointerMove = handlePointerMove.bind(this);
    boundPointerUp = handlePointerUp.bind(this);

    state.canvas.addEventListener('pointerdown', boundPointerDown);
    state.canvas.addEventListener('pointermove', boundPointerMove);
    state.canvas.addEventListener('pointerup', boundPointerUp);
    state.canvas.addEventListener('pointerleave', boundPointerUp);
    state.canvas.addEventListener('pointercancel', boundPointerUp);

    // Prevent default touch behaviors
    state.canvas.addEventListener('touchstart', preventDefault, { passive: false });
    state.canvas.addEventListener('touchmove', preventDefault, { passive: false });
  }

  function removeDrawingEvents() {
    state.canvas.removeEventListener('pointerdown', boundPointerDown);
    state.canvas.removeEventListener('pointermove', boundPointerMove);
    state.canvas.removeEventListener('pointerup', boundPointerUp);
    state.canvas.removeEventListener('pointerleave', boundPointerUp);
    state.canvas.removeEventListener('pointercancel', boundPointerUp);

    state.canvas.removeEventListener('touchstart', preventDefault);
    state.canvas.removeEventListener('touchmove', preventDefault);
  }

  function preventDefault(e) {
    e.preventDefault();
  }

  // ========== Palm Rejection ==========
  function isPalmTouch(e) {
    // Large contact area = likely palm
    if (e.radiusX > CONFIG.palmRejectRadius || e.radiusY > CONFIG.palmRejectRadius) {
      return true;
    }
    // Zero pressure with touch = accidental
    if (e.pointerType === 'touch' && e.pressure === 0) {
      return true;
    }
    return false;
  }

  // ========== Pointer Handlers ==========
  function handlePointerDown(e) {
    if (isPalmTouch(e)) return;

    const point = getPoint(e);

    if (state.currentTool === 'eraser') {
      eraseAtPoint(point);
      return;
    }

    // Ruler toggle: if enabled with pen or highlighter, draw straight lines
    if (state.rulerEnabled && (state.currentTool === 'pen' || state.currentTool === 'highlighter')) {
      state.rulerStart = point;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Selection tool
    if (state.currentTool === 'select') {
      // Check if clicking inside existing selection (drag mode)
      if (state.selectionRect && isInsideRect(point, state.selectionRect)) {
        state.isDraggingSelection = true;
        state.dragOffset = {
          x: point.x - state.selectionRect.x,
          y: point.y - state.selectionRect.y
        };
        state.canvas.setPointerCapture(e.pointerId);
        return;
      }

      // Check if clicking a resize handle
      const handle = getResizeHandle(point);
      if (handle) {
        state.isResizingSelection = true;
        state.resizeHandle = handle;
        state.originalBounds = { ...state.selectionRect };
        state.canvas.setPointerCapture(e.pointerId);
        return;
      }

      // Start new selection rectangle
      state.selectionStart = point;
      state.selectedStrokes = [];
      state.selectionRect = null;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Initialize time tracking for velocity calculation
    state.lastPointTime = performance.now();

    state.currentStroke = {
      tool: state.currentTool,
      color: state.currentColor,
      sizeMultiplier: state.sizeMultiplier,
      points: [point]
    };

    state.canvas.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (isPalmTouch(e)) return;

    const point = getPoint(e);

    if (state.currentTool === 'eraser' && e.buttons > 0) {
      eraseAtPoint(point);
      return;
    }

    // Ruler toggle: show preview line with angle snapping
    if (state.rulerEnabled && state.rulerStart && e.buttons > 0) {
      const snappedEnd = snapToAngle(state.rulerStart, point);
      redrawAllStrokes();
      drawRulerPreview(state.rulerStart, snappedEnd);
      return;
    }

    // Selection tool handling
    if (state.currentTool === 'select') {
      if (state.isDraggingSelection && e.buttons > 0) {
        moveSelection(point);
        return;
      }
      if (state.isResizingSelection && e.buttons > 0) {
        resizeSelection(point);
        return;
      }
      if (state.selectionStart && e.buttons > 0) {
        // Drawing selection rectangle
        redrawAllStrokes();
        drawSelectionPreview(state.selectionStart, point);
        return;
      }
    }

    if (!state.currentStroke) return;

    // Point decimation: skip points too close together (reduces noise without adding lag)
    const lastPoint = state.currentStroke.points[state.currentStroke.points.length - 1];
    if (!shouldAddPoint(point, lastPoint)) return;

    // Calculate velocity factor for natural width variation
    const now = performance.now();
    const timeDelta = (now - state.lastPointTime) / 1000; // Convert to seconds
    const velocityFactor = getVelocityFactor(lastPoint, point, timeDelta);
    state.lastPointTime = now;

    // Add velocity factor to point for width calculation
    point.velocityFactor = velocityFactor;

    state.currentStroke.points.push(point);

    // Clear and redraw to prevent overlapping artifacts from varying line widths
    redrawAllStrokes();
    drawStrokeSegment(state.currentStroke);
  }

  function handlePointerUp(e) {
    // Selection tool: finalize operations
    if (state.currentTool === 'select') {
      if (state.isDraggingSelection) {
        state.isDraggingSelection = false;
        scheduleSave();
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        return;
      }
      if (state.isResizingSelection) {
        state.isResizingSelection = false;
        state.resizeHandle = null;
        state.originalBounds = null;
        scheduleSave();
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        return;
      }
      if (state.selectionStart) {
        const point = getPoint(e);
        finalizeSelection(point);
        state.selectionStart = null;
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        return;
      }
    }

    // Ruler toggle: finalize the straight line
    if (state.rulerEnabled && state.rulerStart) {
      const point = getPoint(e);
      const snappedEnd = snapToAngle(state.rulerStart, point);

      // Only save if there's actual distance
      const dx = snappedEnd.x - state.rulerStart.x;
      const dy = snappedEnd.y - state.rulerStart.y;
      if (Math.hypot(dx, dy) > 5) {
        // Use current tool (pen or highlighter) for the stroke
        const stroke = {
          tool: state.currentTool,
          color: state.currentColor,
          sizeMultiplier: state.sizeMultiplier,
          points: [state.rulerStart, snappedEnd]
        };
        state.strokes.push(stroke);
        scheduleSave();
      }

      state.rulerStart = null;
      redrawAllStrokes();

      try {
        state.canvas.releasePointerCapture(e.pointerId);
      } catch (err) { /* ignore */ }
      return;
    }

    if (state.currentStroke && state.currentStroke.points.length > 1) {
      state.strokes.push(state.currentStroke);
      scheduleSave();
    }
    state.currentStroke = null;

    // Reset time tracking for next stroke
    state.lastPointTime = 0;

    // Release pointer capture to prevent stuck state
    try {
      state.canvas.releasePointerCapture(e.pointerId);
    } catch (err) { /* ignore if not captured */ }
  }

  /**
   * Get point from pointer event.
   * With visual-viewport-space architecture, we store raw screen coordinates.
   * The canvas follows the visual viewport, so no transforms are needed.
   */
  function getPoint(e) {
    return {
      x: e.clientX,
      y: e.clientY,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };
  }

  // ========== Point Processing ==========
  /**
   * Check if a new point should be added (point decimation)
   * Skips points that are too close together to reduce jitter
   */
  function shouldAddPoint(newPoint, lastPoint) {
    if (!lastPoint) return true;
    const dx = newPoint.x - lastPoint.x;
    const dy = newPoint.y - lastPoint.y;
    return Math.hypot(dx, dy) >= CONFIG.minPointDistance;
  }

  /**
   * Calculate velocity factor for width adjustment
   * Fast strokes = thinner lines (more natural feel)
   */
  function getVelocityFactor(lastPoint, newPoint, timeDelta) {
    if (!lastPoint || timeDelta <= 0) return 1;

    const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);
    const velocity = distance / timeDelta;
    const normalizedVelocity = Math.min(1, velocity / CONFIG.maxVelocity);

    // Returns 1 at rest, down to (1 - velocityWeight) at max velocity
    return 1 - (normalizedVelocity * CONFIG.velocityWeight);
  }

  // ========== Drawing ==========
  /**
   * Draws the current stroke as one continuous path.
   * With visual-viewport-space architecture, coordinates are used directly.
   */
  function drawStrokeSegment(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;
    const len = points.length;

    if (len < 2) return;

    const tool = CONFIG.tools[stroke.tool];

    ctx.save();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    // Use latest point's width for consistent appearance
    const sizeMult = stroke.sizeMultiplier || 1;
    const lastPoint = points[len - 1];
    const velocityFactor = lastPoint.velocityFactor || 1;
    const baseWidth = tool.minWidth + (lastPoint.pressure * (tool.maxWidth - tool.minWidth));
    ctx.lineWidth = baseWidth * sizeMult * velocityFactor;

    // Draw FULL stroke as one continuous path - use coordinates directly
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < len; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (i === 1) {
        ctx.lineTo(curr.x, curr.y);
      } else {
        // Quadratic curve through midpoint for smoothness
        const mid = {
          x: (prev.x + curr.x) / 2,
          y: (prev.y + curr.y) / 2
        };
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  function redrawAllStrokes() {
    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);

    for (const stroke of state.strokes) {
      drawFullStroke(stroke);
    }

    // Draw selection box if active
    if (state.currentTool === 'select') {
      drawSelectionBox();
    }
  }

  /**
   * Draws a completed stroke for redraw.
   * With visual-viewport-space architecture, coordinates are used directly.
   */
  function drawFullStroke(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;

    if (points.length < 2) return;

    const tool = CONFIG.tools[stroke.tool];

    ctx.save();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    // Set lineWidth ONCE using average of all points
    // (Canvas applies lineWidth at stroke() time, not per-segment)
    const sizeMult = stroke.sizeMultiplier || 1;
    let totalWidth = 0;
    for (const p of points) {
      const vf = p.velocityFactor || 1;
      const bw = tool.minWidth + (p.pressure * (tool.maxWidth - tool.minWidth));
      totalWidth += bw * sizeMult * vf;
    }
    ctx.lineWidth = totalWidth / points.length;

    // Draw full stroke as one continuous path - use coordinates directly
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (i === 1) {
        ctx.lineTo(curr.x, curr.y);
      } else {
        // Quadratic curve through midpoint for smoothness
        const mid = {
          x: (prev.x + curr.x) / 2,
          y: (prev.y + curr.y) / 2
        };
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  // ========== Ruler Helpers ==========
  function snapToAngle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const distance = Math.hypot(dx, dy);

    // Snap to nearest 45° (π/4 radians)
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

    return {
      x: start.x + Math.cos(snapAngle) * distance,
      y: start.y + Math.sin(snapAngle) * distance,
      pressure: end.pressure || 0.5
    };
  }

  function drawRulerPreview(start, end) {
    const ctx = state.ctx;
    const tool = CONFIG.tools[state.currentTool] || CONFIG.tools.pen;

    ctx.save();

    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = tool.maxWidth * state.sizeMultiplier;
    ctx.lineCap = 'round';
    ctx.globalAlpha = state.currentTool === 'highlighter' ? 0.35 : 0.5;
    ctx.setLineDash([8, 8]);

    // Use coordinates directly
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // ========== Selection Helpers ==========
  function isInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w &&
           point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function getStrokeBounds(stroke) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of stroke.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function isStrokeInRect(stroke, rect) {
    const bounds = getStrokeBounds(stroke);
    // Check if any point of the stroke is inside the selection rectangle
    for (const p of stroke.points) {
      if (p.x >= rect.x && p.x <= rect.x + rect.w &&
          p.y >= rect.y && p.y <= rect.y + rect.h) {
        return true;
      }
    }
    return false;
  }

  function getResizeHandle(point) {
    if (!state.selectionRect) return null;
    const rect = state.selectionRect;
    const handleSize = 20; // Touch-friendly size

    const corners = [
      { name: 'nw', x: rect.x, y: rect.y },
      { name: 'ne', x: rect.x + rect.w, y: rect.y },
      { name: 'sw', x: rect.x, y: rect.y + rect.h },
      { name: 'se', x: rect.x + rect.w, y: rect.y + rect.h }
    ];

    for (const corner of corners) {
      if (Math.abs(point.x - corner.x) < handleSize &&
          Math.abs(point.y - corner.y) < handleSize) {
        return corner.name;
      }
    }
    return null;
  }

  function finalizeSelection(endPoint) {
    const rect = {
      x: Math.min(state.selectionStart.x, endPoint.x),
      y: Math.min(state.selectionStart.y, endPoint.y),
      w: Math.abs(endPoint.x - state.selectionStart.x),
      h: Math.abs(endPoint.y - state.selectionStart.y)
    };

    // Minimum selection size
    if (rect.w < 10 || rect.h < 10) {
      state.selectionRect = null;
      state.selectedStrokes = [];
      redrawAllStrokes();
      return;
    }

    // Find strokes that intersect with selection
    state.selectedStrokes = state.strokes.filter(s => isStrokeInRect(s, rect));

    if (state.selectedStrokes.length > 0) {
      // Calculate tight bounding box around selected strokes
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of state.selectedStrokes) {
        const b = getStrokeBounds(stroke);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
      // Add padding around selection
      const padding = 10;
      state.selectionRect = {
        x: minX - padding,
        y: minY - padding,
        w: (maxX - minX) + padding * 2,
        h: (maxY - minY) + padding * 2
      };
    } else {
      state.selectionRect = null;
    }

    redrawAllStrokes();
    drawSelectionBox();
  }

  function moveSelection(point) {
    const dx = point.x - state.dragOffset.x - state.selectionRect.x;
    const dy = point.y - state.dragOffset.y - state.selectionRect.y;

    // Move all selected stroke points
    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    // Update selection rectangle
    state.selectionRect.x += dx;
    state.selectionRect.y += dy;

    redrawAllStrokes();
    drawSelectionBox();
  }

  function resizeSelection(point) {
    if (!state.originalBounds || !state.resizeHandle) return;

    const orig = state.originalBounds;
    let newRect = { ...state.selectionRect };

    // Calculate new bounds based on which handle is being dragged
    switch (state.resizeHandle) {
      case 'se':
        newRect.w = Math.max(20, point.x - orig.x);
        newRect.h = Math.max(20, point.y - orig.y);
        break;
      case 'sw':
        newRect.x = Math.min(point.x, orig.x + orig.w - 20);
        newRect.w = orig.x + orig.w - newRect.x;
        newRect.h = Math.max(20, point.y - orig.y);
        break;
      case 'ne':
        newRect.w = Math.max(20, point.x - orig.x);
        newRect.y = Math.min(point.y, orig.y + orig.h - 20);
        newRect.h = orig.y + orig.h - newRect.y;
        break;
      case 'nw':
        newRect.x = Math.min(point.x, orig.x + orig.w - 20);
        newRect.y = Math.min(point.y, orig.y + orig.h - 20);
        newRect.w = orig.x + orig.w - newRect.x;
        newRect.h = orig.y + orig.h - newRect.y;
        break;
    }

    // Calculate scale factors
    const scaleX = newRect.w / orig.w;
    const scaleY = newRect.h / orig.h;

    // Scale all selected stroke points relative to original bounds
    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        // Get position relative to original bounds center
        const relX = p.x - (orig.x + orig.w / 2);
        const relY = p.y - (orig.y + orig.h / 2);

        // Scale and reposition
        p.x = (newRect.x + newRect.w / 2) + relX * scaleX;
        p.y = (newRect.y + newRect.h / 2) + relY * scaleY;
      }
    }

    state.selectionRect = newRect;
    state.originalBounds = { ...newRect }; // Update for continuous resize

    redrawAllStrokes();
    drawSelectionBox();
  }

  function drawSelectionPreview(start, end) {
    const ctx = state.ctx;

    // Use coordinates directly
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y)
    };

    ctx.save();

    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
    ctx.setLineDash([]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawSelectionBox() {
    if (!state.selectionRect || state.selectedStrokes.length === 0) return;

    const ctx = state.ctx;
    const rect = state.selectionRect;

    ctx.save();

    // Dashed border
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    // Corner handles (solid squares)
    ctx.setLineDash([]);
    ctx.fillStyle = '#007AFF';
    const handleSize = 12;

    const corners = [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h]
    ];

    for (const [x, y] of corners) {
      ctx.fillRect(
        x - handleSize / 2,
        y - handleSize / 2,
        handleSize,
        handleSize
      );
    }

    ctx.restore();
  }

  // ========== Eraser ==========
  function eraseAtPoint(point) {
    const radius = CONFIG.tools.eraser.radius;
    let erased = false;

    state.strokes = state.strokes.filter(stroke => {
      for (const p of stroke.points) {
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        if (dx * dx + dy * dy < radius * radius) {
          erased = true;
          return false;
        }
      }
      return true;
    });

    if (erased) {
      redrawAllStrokes();
      scheduleSave();
    }
  }

  // ========== Persistence ==========
  let saveTimeout = null;

  function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveAnnotations, CONFIG.saveDebounce);
  }

  function getStorageKey() {
    // Use filename as base key (per-view data stored in single object)
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index';
    return 'annotations-' + filename;
  }

  async function saveAnnotations() {
    const key = getStorageKey();
    try {
      // Update strokesByView with current view's strokes
      state.strokesByView[state.currentViewId] = state.strokes;

      // Save all views in one storage item
      await localforage.setItem(key, state.strokesByView);
    } catch (err) {
      console.error('Failed to save annotations:', err);
    }
  }

  async function loadAnnotations() {
    const key = getStorageKey();
    try {
      const saved = await localforage.getItem(key);

      if (saved && typeof saved === 'object') {
        // Check if it's old format (array) or new format (object with views)
        if (Array.isArray(saved)) {
          // Old format: migrate to new per-view format
          state.strokesByView = { [state.currentViewId]: saved };
          state.strokes = saved;
        } else {
          // New format: load all views
          state.strokesByView = saved;
          state.strokes = saved[state.currentViewId] || [];
        }
        redrawAllStrokes();
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  }

  // ========== Start ==========
  init();
})();
