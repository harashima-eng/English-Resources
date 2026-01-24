/**
 * Annotation Module v3 - GoodNotes-Style Document-Space Architecture
 *
 * KEY CHANGES FROM v2:
 * 1. Strokes stored in DOCUMENT coordinates (not screen)
 * 2. Transforms applied when rendering (scale + translate)
 * 3. Scrolling works even in draw mode (only blocks when actively drawing)
 * 4. Strokes scale proportionally with pinch-zoom
 * 5. Strokes stay anchored to document position
 *
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
    minPointDistance: 2,
    velocityWeight: 0.3,
    maxVelocity: 1000
  };

  // ========== State ==========
  let state = {
    isDrawMode: false,
    isActivelyDrawing: false,  // TRUE only when pen/finger is down and drawing
    currentTool: 'pen',
    currentColor: CONFIG.colors[0],
    strokes: [],
    currentStroke: null,
    canvas: null,
    ctx: null,
    dpr: 1,
    sizeMultiplier: 1,
    rulerStart: null,
    rulerEnabled: false,
    lastPointTime: 0,
    // Selection tool state
    selectionStart: null,
    selectionRect: null,
    selectedStrokes: [],
    isDraggingSelection: false,
    isResizingSelection: false,
    resizeHandle: null,
    dragOffset: { x: 0, y: 0 },
    originalBounds: null,
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

    // Initial render
    requestAnimationFrame(() => {
      resizeCanvas();
      redrawAllStrokes();
    });
  }

  // ========== Coordinate Transform Functions ==========

  /**
   * Convert SCREEN coordinates to DOCUMENT coordinates.
   * Use this when CAPTURING points from pointer events.
   *
   * @param {number} screenX - clientX from pointer event
   * @param {number} screenY - clientY from pointer event
   * @returns {object} - { x, y } in document space
   */
  function screenToDoc(screenX, screenY) {
    const vv = window.visualViewport;
    const zoom = vv?.scale || 1;
    const offsetX = vv?.offsetLeft || 0;
    const offsetY = vv?.offsetTop || 0;

    return {
      x: (screenX + offsetX) / zoom + window.scrollX,
      y: (screenY + offsetY) / zoom + window.scrollY
    };
  }

  /**
   * Convert DOCUMENT coordinates to CANVAS coordinates.
   * Use this when RENDERING strokes to the canvas.
   *
   * @param {number} docX - x position in document space
   * @param {number} docY - y position in document space
   * @returns {object} - { x, y } in canvas space
   */
  function docToCanvas(docX, docY) {
    const vv = window.visualViewport;
    const zoom = vv?.scale || 1;
    const offsetX = vv?.offsetLeft || 0;
    const offsetY = vv?.offsetTop || 0;

    return {
      x: ((docX - window.scrollX) * zoom) - offsetX,
      y: ((docY - window.scrollY) * zoom) - offsetY
    };
  }

  /**
   * Get the current zoom level from Visual Viewport API
   * @returns {number} - zoom scale (1 = no zoom)
   */
  function getZoom() {
    return window.visualViewport?.scale || 1;
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
    const views = document.querySelectorAll('.view');
    if (views.length === 0) return;

    const observer = new MutationObserver(() => {
      if (state.currentStroke) return; // Don't switch during active drawing

      try {
        const newViewId = getCurrentViewId();
        if (newViewId !== state.currentViewId) {
          state.strokesByView[state.currentViewId] = state.strokes;
          state.currentViewId = newViewId;
          state.strokes = state.strokesByView[newViewId] || [];
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
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 9998;
      touch-action: none;
    `;
    document.body.appendChild(canvas);
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { willReadFrequently: false });

    resizeCanvas();
  }

  function resizeCanvas() {
    const canvas = state.canvas;
    const vv = window.visualViewport;
    state.dpr = window.devicePixelRatio || 1;

    // Canvas covers the entire visual viewport
    const cssWidth = vv ? vv.width : window.innerWidth;
    const cssHeight = vv ? vv.height : window.innerHeight;

    // High-DPI support: internal resolution = CSS size * DPR
    canvas.width = cssWidth * state.dpr;
    canvas.height = cssHeight * state.dpr;
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';

    // Canvas stays at 0,0 - position:fixed already follows visual viewport on iOS
    canvas.style.left = '0px';
    canvas.style.top = '0px';

    // Reset and scale context for DPR
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(state.dpr, state.dpr);
  }

  function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeCanvas();
        redrawAllStrokes();
      }, 100);
    });
  }

  function setupScrollHandler() {
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
    if (!window.visualViewport) return;

    let viewportRAF = null;
    function handleViewportChange() {
      if (viewportRAF) return;
      viewportRAF = requestAnimationFrame(() => {
        resizeCanvas();
        redrawAllStrokes();
        repositionToolbar();
        viewportRAF = null;
      });
    }

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
  }

  function repositionToolbar() {
    const toolbar = document.getElementById('annotation-toolbar');
    if (!toolbar) return;

    const vv = window.visualViewport;
    if (!vv || vv.scale === 1) {
      toolbar.style.transform = '';
      toolbar.style.left = '24px';
      toolbar.style.top = '';
      toolbar.style.right = '';
      toolbar.style.bottom = '24px';
      return;
    }

    const padding = 24;
    toolbar.style.right = '';
    toolbar.style.bottom = 'auto';
    toolbar.style.left = (vv.offsetLeft + padding) + 'px';
    toolbar.style.top = (vv.offsetTop + vv.height - toolbar.offsetHeight - padding) + 'px';
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

    // Ruler toggle button
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
      btn.className = 'ann-size' + (i === 2 ? ' active' : '');
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
    repositionToolbar();
  }

  function setupToolbarEvents(toolbar) {
    // Long-press handler for clear button
    let clearPressTimer = null;
    let didLongPress = false;
    const clearBtn = toolbar.querySelector('[data-action="clear"]');

    if (clearBtn) {
      clearBtn.addEventListener('pointerdown', () => {
        didLongPress = false;
        clearPressTimer = setTimeout(() => {
          didLongPress = true;
          if (confirm('Clear ALL annotations for ALL sections?')) {
            state.strokes = [];
            state.strokesByView = {};
            localforage.removeItem(getStorageKey());
            redrawAllStrokes();
          }
        }, 1500);
      });

      clearBtn.addEventListener('pointerup', () => clearTimeout(clearPressTimer));
      clearBtn.addEventListener('pointerleave', () => clearTimeout(clearPressTimer));
    }

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-tool], [data-toggle], [data-color], [data-size]');
      if (!btn) return;

      if (btn.dataset.action === 'toggle') {
        toggleDrawMode();
      } else if (btn.dataset.action === 'clear') {
        if (didLongPress) {
          didLongPress = false;
          return;
        }
        state.strokes = [];
        state.strokesByView[state.currentViewId] = [];
        redrawAllStrokes();
        saveAnnotations();
      } else if (btn.dataset.tool) {
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
  let boundTouchStart, boundTouchMove;

  function setupDrawingEvents() {
    boundPointerDown = handlePointerDown.bind(this);
    boundPointerMove = handlePointerMove.bind(this);
    boundPointerUp = handlePointerUp.bind(this);
    boundTouchStart = handleTouchStart.bind(this);
    boundTouchMove = handleTouchMove.bind(this);

    state.canvas.addEventListener('pointerdown', boundPointerDown);
    state.canvas.addEventListener('pointermove', boundPointerMove);
    state.canvas.addEventListener('pointerup', boundPointerUp);
    state.canvas.addEventListener('pointerleave', boundPointerUp);
    state.canvas.addEventListener('pointercancel', boundPointerUp);

    // Touch events for scroll control - CRITICAL for allowing scroll in draw mode
    state.canvas.addEventListener('touchstart', boundTouchStart, { passive: false });
    state.canvas.addEventListener('touchmove', boundTouchMove, { passive: false });
  }

  function removeDrawingEvents() {
    state.canvas.removeEventListener('pointerdown', boundPointerDown);
    state.canvas.removeEventListener('pointermove', boundPointerMove);
    state.canvas.removeEventListener('pointerup', boundPointerUp);
    state.canvas.removeEventListener('pointerleave', boundPointerUp);
    state.canvas.removeEventListener('pointercancel', boundPointerUp);

    state.canvas.removeEventListener('touchstart', boundTouchStart);
    state.canvas.removeEventListener('touchmove', boundTouchMove);
  }

  /**
   * CRITICAL: Only prevent default when ACTIVELY drawing.
   * This allows scrolling and pinch-zoom to work in draw mode.
   */
  function handleTouchStart(e) {
    // Multi-touch = pinch zoom, always allow
    if (e.touches.length > 1) {
      return;
    }
    // Single touch while actively drawing = prevent scroll
    if (state.isActivelyDrawing) {
      e.preventDefault();
    }
  }

  function handleTouchMove(e) {
    // Only prevent scroll when actively drawing
    if (state.isActivelyDrawing) {
      e.preventDefault();
    }
    // Otherwise, scroll/pinch happens naturally
  }

  // ========== Palm Rejection ==========
  function isPalmTouch(e) {
    if (e.radiusX > CONFIG.palmRejectRadius || e.radiusY > CONFIG.palmRejectRadius) {
      return true;
    }
    if (e.pointerType === 'touch' && e.pressure === 0) {
      return true;
    }
    return false;
  }

  // ========== Pointer Handlers ==========
  function handlePointerDown(e) {
    if (isPalmTouch(e)) return;

    // Convert screen coordinates to document coordinates
    const docCoords = screenToDoc(e.clientX, e.clientY);
    const point = {
      x: docCoords.x,
      y: docCoords.y,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };

    if (state.currentTool === 'eraser') {
      eraseAtPoint(point);
      state.isActivelyDrawing = true;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Ruler mode
    if (state.rulerEnabled && (state.currentTool === 'pen' || state.currentTool === 'highlighter')) {
      state.rulerStart = point;
      state.isActivelyDrawing = true;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Selection tool
    if (state.currentTool === 'select') {
      if (state.selectionRect && isInsideRect(point, state.selectionRect)) {
        state.isDraggingSelection = true;
        state.dragOffset = {
          x: point.x - state.selectionRect.x,
          y: point.y - state.selectionRect.y
        };
        state.isActivelyDrawing = true;
        state.canvas.setPointerCapture(e.pointerId);
        return;
      }

      const handle = getResizeHandle(point);
      if (handle) {
        state.isResizingSelection = true;
        state.resizeHandle = handle;
        state.originalBounds = { ...state.selectionRect };
        state.isActivelyDrawing = true;
        state.canvas.setPointerCapture(e.pointerId);
        return;
      }

      state.selectionStart = point;
      state.selectedStrokes = [];
      state.selectionRect = null;
      state.isActivelyDrawing = true;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Regular stroke
    state.lastPointTime = performance.now();
    state.isActivelyDrawing = true;

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

    // Convert to document coordinates
    const docCoords = screenToDoc(e.clientX, e.clientY);
    const point = {
      x: docCoords.x,
      y: docCoords.y,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };

    if (state.currentTool === 'eraser' && e.buttons > 0) {
      eraseAtPoint(point);
      return;
    }

    // Ruler preview
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
        redrawAllStrokes();
        drawSelectionPreview(state.selectionStart, point);
        return;
      }
    }

    if (!state.currentStroke) return;

    // Point decimation
    const lastPoint = state.currentStroke.points[state.currentStroke.points.length - 1];
    if (!shouldAddPoint(point, lastPoint)) return;

    // Velocity factor for natural width variation
    const now = performance.now();
    const timeDelta = (now - state.lastPointTime) / 1000;
    const velocityFactor = getVelocityFactor(lastPoint, point, timeDelta);
    state.lastPointTime = now;

    point.velocityFactor = velocityFactor;
    state.currentStroke.points.push(point);

    // Clear and redraw
    redrawAllStrokes();
    drawStrokeSegment(state.currentStroke);
  }

  function handlePointerUp(e) {
    state.isActivelyDrawing = false;

    // Selection tool finalization
    if (state.currentTool === 'select') {
      if (state.isDraggingSelection) {
        state.isDraggingSelection = false;
        scheduleSave();
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (state.isResizingSelection) {
        state.isResizingSelection = false;
        state.resizeHandle = null;
        state.originalBounds = null;
        scheduleSave();
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (state.selectionStart) {
        const docCoords = screenToDoc(e.clientX, e.clientY);
        finalizeSelection(docCoords);
        state.selectionStart = null;
        try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }

    // Ruler finalization
    if (state.rulerEnabled && state.rulerStart) {
      const docCoords = screenToDoc(e.clientX, e.clientY);
      const snappedEnd = snapToAngle(state.rulerStart, docCoords);

      const dx = snappedEnd.x - state.rulerStart.x;
      const dy = snappedEnd.y - state.rulerStart.y;
      if (Math.hypot(dx, dy) > 5) {
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
      try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    // Regular stroke finalization
    if (state.currentStroke && state.currentStroke.points.length > 1) {
      state.strokes.push(state.currentStroke);
      scheduleSave();
    }
    state.currentStroke = null;
    state.lastPointTime = 0;

    try { state.canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  // ========== Point Processing ==========
  function shouldAddPoint(newPoint, lastPoint) {
    if (!lastPoint) return true;
    const dx = newPoint.x - lastPoint.x;
    const dy = newPoint.y - lastPoint.y;
    return Math.hypot(dx, dy) >= CONFIG.minPointDistance;
  }

  function getVelocityFactor(lastPoint, newPoint, timeDelta) {
    if (!lastPoint || timeDelta <= 0) return 1;
    const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);
    const velocity = distance / timeDelta;
    const normalizedVelocity = Math.min(1, velocity / CONFIG.maxVelocity);
    return 1 - (normalizedVelocity * CONFIG.velocityWeight);
  }

  function snapToAngle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const distance = Math.hypot(dx, dy);
    return {
      x: start.x + Math.cos(snapAngle) * distance,
      y: start.y + Math.sin(snapAngle) * distance,
      pressure: end.pressure || 0.5
    };
  }

  // ========== Drawing Functions ==========

  /**
   * Draw a stroke segment (current stroke while drawing).
   * Points are in DOCUMENT space, we convert to SCREEN space for rendering.
   */
  function drawStrokeSegment(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;
    const len = points.length;

    if (len < 2) return;

    const tool = CONFIG.tools[stroke.tool];
    const zoom = getZoom();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    // Line width scales with zoom for consistent visual appearance
    const sizeMult = stroke.sizeMultiplier || 1;
    const lastPoint = points[len - 1];
    const velocityFactor = lastPoint.velocityFactor || 1;
    const baseWidth = tool.minWidth + (lastPoint.pressure * (tool.maxWidth - tool.minWidth));
    ctx.lineWidth = baseWidth * sizeMult * velocityFactor * zoom;

    // Draw path - convert each point from document to screen space
    ctx.beginPath();
    const firstScreen = docToCanvas(points[0].x, points[0].y);
    ctx.moveTo(firstScreen.x, firstScreen.y);

    for (let i = 1; i < len; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevScreen = docToCanvas(prev.x, prev.y);
      const currScreen = docToCanvas(curr.x, curr.y);

      if (i === 1) {
        ctx.lineTo(currScreen.x, currScreen.y);
      } else {
        // Quadratic curve through midpoint for smoothness
        const mid = {
          x: (prevScreen.x + currScreen.x) / 2,
          y: (prevScreen.y + currScreen.y) / 2
        };
        ctx.quadraticCurveTo(prevScreen.x, prevScreen.y, mid.x, mid.y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw a completed stroke (on redraw).
   * Points are in DOCUMENT space, we convert to SCREEN space.
   */
  function drawFullStroke(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;

    if (points.length < 2) return;

    const tool = CONFIG.tools[stroke.tool];
    const zoom = getZoom();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    // Use average pressure for consistent width
    const avgPressure = points.reduce((sum, p) => sum + (p.pressure || 0.5), 0) / points.length;
    const sizeMult = stroke.sizeMultiplier || 1;
    const baseWidth = tool.minWidth + (avgPressure * (tool.maxWidth - tool.minWidth));
    ctx.lineWidth = baseWidth * sizeMult * zoom;

    // Draw in screen coordinates
    ctx.beginPath();
    const firstScreen = docToCanvas(points[0].x, points[0].y);
    ctx.moveTo(firstScreen.x, firstScreen.y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevScreen = docToCanvas(prev.x, prev.y);
      const currScreen = docToCanvas(curr.x, curr.y);

      if (i === 1) {
        ctx.lineTo(currScreen.x, currScreen.y);
      } else {
        const mid = {
          x: (prevScreen.x + currScreen.x) / 2,
          y: (prevScreen.y + currScreen.y) / 2
        };
        ctx.quadraticCurveTo(prevScreen.x, prevScreen.y, mid.x, mid.y);
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

    if (state.currentTool === 'select') {
      drawSelectionBox();
    }
  }

  function drawRulerPreview(start, end) {
    const ctx = state.ctx;
    const tool = CONFIG.tools[state.currentTool];
    const zoom = getZoom();

    const startScreen = docToCanvas(start.x, start.y);
    const endScreen = docToCanvas(end.x, end.y);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = state.currentColor;
    ctx.globalAlpha = tool.opacity;
    ctx.lineWidth = (tool.minWidth + tool.maxWidth) / 2 * state.sizeMultiplier * zoom;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(endScreen.x, endScreen.y);
    ctx.stroke();

    ctx.restore();
  }

  // ========== Selection Tool Functions ==========
  function isInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w &&
           point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function isStrokeInRect(stroke, rect) {
    return stroke.points.some(p =>
      p.x >= rect.x && p.x <= rect.x + rect.w &&
      p.y >= rect.y && p.y <= rect.y + rect.h
    );
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

  function getResizeHandle(point) {
    if (!state.selectionRect) return null;
    const rect = state.selectionRect;
    const handleSize = 20;

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

    if (rect.w < 10 || rect.h < 10) {
      state.selectionRect = null;
      state.selectedStrokes = [];
      redrawAllStrokes();
      return;
    }

    state.selectedStrokes = state.strokes.filter(s => isStrokeInRect(s, rect));

    if (state.selectedStrokes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of state.selectedStrokes) {
        const b = getStrokeBounds(stroke);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
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

    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    state.selectionRect.x += dx;
    state.selectionRect.y += dy;

    redrawAllStrokes();
    drawSelectionBox();
  }

  function resizeSelection(point) {
    if (!state.originalBounds || !state.resizeHandle) return;

    const orig = state.originalBounds;
    let newRect = { ...state.selectionRect };

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

    const scaleX = newRect.w / orig.w;
    const scaleY = newRect.h / orig.h;

    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        const relX = p.x - (orig.x + orig.w / 2);
        const relY = p.y - (orig.y + orig.h / 2);
        p.x = (newRect.x + newRect.w / 2) + relX * scaleX;
        p.y = (newRect.y + newRect.h / 2) + relY * scaleY;
      }
    }

    state.selectionRect = newRect;
    state.originalBounds = { ...newRect };

    redrawAllStrokes();
    drawSelectionBox();
  }

  function drawSelectionPreview(start, end) {
    const ctx = state.ctx;
    const zoom = getZoom();

    const startScreen = docToCanvas(start.x, start.y);
    const endScreen = docToCanvas(end.x, end.y);

    const rect = {
      x: Math.min(startScreen.x, endScreen.x),
      y: Math.min(startScreen.y, endScreen.y),
      w: Math.abs(endScreen.x - startScreen.x),
      h: Math.abs(endScreen.y - startScreen.y)
    };

    ctx.save();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
    ctx.setLineDash([]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawSelectionBox() {
    if (!state.selectionRect || state.selectedStrokes.length === 0) return;

    const ctx = state.ctx;
    const rect = state.selectionRect;

    // Convert document rect to screen rect
    const topLeft = docToCanvas(rect.x, rect.y);
    const bottomRight = docToCanvas(rect.x + rect.w, rect.y + rect.h);
    const screenRect = {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y
    };

    ctx.save();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);

    ctx.setLineDash([]);
    ctx.fillStyle = '#007AFF';
    const handleSize = 12;

    const corners = [
      [screenRect.x, screenRect.y],
      [screenRect.x + screenRect.w, screenRect.y],
      [screenRect.x, screenRect.y + screenRect.h],
      [screenRect.x + screenRect.w, screenRect.y + screenRect.h]
    ];

    for (const [x, y] of corners) {
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    }

    ctx.restore();
  }

  // ========== Eraser ==========
  function eraseAtPoint(docPoint) {
    const radius = CONFIG.tools.eraser.radius;
    let erased = false;

    state.strokes = state.strokes.filter(stroke => {
      for (const p of stroke.points) {
        const dx = p.x - docPoint.x;
        const dy = p.y - docPoint.y;
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
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index';
    return 'annotations-' + filename;
  }

  async function saveAnnotations() {
    const key = getStorageKey();
    try {
      state.strokesByView[state.currentViewId] = state.strokes;
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
        if (Array.isArray(saved)) {
          state.strokesByView = { [state.currentViewId]: saved };
          state.strokes = saved;
        } else {
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
