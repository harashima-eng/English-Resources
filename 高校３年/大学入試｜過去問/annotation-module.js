/**
 * Annotation Module v7.4 - Dual-Canvas Architecture
 *
 * ARCHITECTURE:
 * - Background Canvas: position: absolute, full document, stores completed strokes
 * - Active Canvas: position: fixed, viewport-sized, for current stroke only (FAST!)
 *
 * During drawing, you're only touching a ~1024x768px canvas instead of ~1024x32000px.
 * Expected 10-30x performance improvement during active drawing.
 *
 * PERFORMANCE FEATURES (from v7.3):
 * - getCoalescedEvents() for Apple Pencil
 * - Path2D caching for completed strokes
 * - Viewport culling for off-screen strokes
 * - Lower DPR (1.5) for performance
 *
 * FEATURES (from v7.2):
 * - Undo/Redo with 50-step history
 * - Toolbar stays visible during pinch-zoom
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
    minPointDistance: 4,
    velocityWeight: 0.3,
    maxVelocity: 1000,
    maxCanvasHeight: 32000,
    maxHistorySize: 50,
    maxDPR: 1.5,
    useCoalescedEvents: true
  };

  // ========== State ==========
  let state = {
    isDrawMode: false,
    isActivelyDrawing: false,
    currentTool: 'pen',
    currentColor: CONFIG.colors[0],
    strokes: [],
    currentStroke: null,
    // v7.4: Dual-canvas architecture
    backgroundCanvas: null,
    activeCanvas: null,
    bgCtx: null,
    activeCtx: null,
    dpr: 1,
    sizeMultiplier: 1,
    rulerStart: null,
    rulerEnabled: false,
    lastPointTime: 0,
    // Undo/Redo
    undoStack: [],
    redoStack: [],
    // Performance (from v7.3)
    pathCache: new Map(),
    viewportBounds: null,
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
    createCanvases();
    createToolbar();
    initViewTracking();
    loadAnnotations();
    setupResizeHandler();
    setupViewChangeListener();
    setupToolbarViewportHandler();
    setupActiveCanvasViewportHandler();

    requestAnimationFrame(() => {
      resizeBackgroundCanvas();
      resizeActiveCanvas();
      redrawBackground();
    });
  }

  // ========== Undo/Redo Functions ==========

  function cloneStrokes(strokes) {
    return strokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(p => ({ ...p }))
    }));
  }

  function pushToUndoStack() {
    state.undoStack.push(cloneStrokes(state.strokes));
    if (state.undoStack.length > CONFIG.maxHistorySize) {
      state.undoStack.shift();
    }
    state.redoStack = [];
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(cloneStrokes(state.strokes));
    state.strokes = state.undoStack.pop();
    state.strokesByView[state.currentViewId] = state.strokes;
    invalidatePathCache();
    redrawBackground();
    saveAnnotations();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(cloneStrokes(state.strokes));
    state.strokes = state.redoStack.pop();
    state.strokesByView[state.currentViewId] = state.strokes;
    invalidatePathCache();
    redrawBackground();
    saveAnnotations();
  }

  // ========== Toolbar Viewport Handler ==========

  function setupToolbarViewportHandler() {
    if (!window.visualViewport) return;

    function repositionToolbar() {
      const toolbar = document.getElementById('annotation-toolbar');
      if (!toolbar) return;

      const vv = window.visualViewport;
      toolbar.style.left = (vv.offsetLeft + 24) + 'px';
      toolbar.style.bottom = 'auto';
      toolbar.style.top = (vv.offsetTop + vv.height - toolbar.offsetHeight - 24) + 'px';
    }

    window.visualViewport.addEventListener('resize', repositionToolbar);
    window.visualViewport.addEventListener('scroll', repositionToolbar);
  }

  // ========== v7.4: Active Canvas Viewport Handler ==========

  function setupActiveCanvasViewportHandler() {
    if (!window.visualViewport) return;

    window.visualViewport.addEventListener('resize', repositionActiveCanvas);
    window.visualViewport.addEventListener('scroll', repositionActiveCanvas);
  }

  function repositionActiveCanvas() {
    if (!state.activeCanvas) return;

    const vv = window.visualViewport;
    if (!vv) return;

    state.activeCanvas.style.left = vv.offsetLeft + 'px';
    state.activeCanvas.style.top = vv.offsetTop + 'px';
    state.activeCanvas.style.width = vv.width + 'px';
    state.activeCanvas.style.height = vv.height + 'px';

    // Resize buffer if needed
    const targetWidth = vv.width * state.dpr;
    const targetHeight = vv.height * state.dpr;

    if (state.activeCanvas.width !== targetWidth || state.activeCanvas.height !== targetHeight) {
      state.activeCanvas.width = targetWidth;
      state.activeCanvas.height = targetHeight;
      state.activeCtx.setTransform(1, 0, 0, 1, 0, 0);
      state.activeCtx.scale(state.dpr, state.dpr);
    }
  }

  // ========== Coordinate Functions ==========

  /**
   * v7.4: Get SCREEN coordinates from pointer event (for active canvas)
   */
  function getScreenPoint(e) {
    return {
      x: e.clientX,
      y: e.clientY,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };
  }

  /**
   * v7.4: Convert screen coordinates to document coordinates (for storage)
   */
  function screenToDocument(point) {
    const vv = window.visualViewport;
    const offsetX = vv ? vv.offsetLeft : 0;
    const offsetY = vv ? vv.offsetTop : 0;

    return {
      x: point.x + window.scrollX + offsetX,
      y: point.y + window.scrollY + offsetY,
      pressure: point.pressure,
      tiltX: point.tiltX,
      tiltY: point.tiltY
    };
  }

  /**
   * v7.4: Convert document coordinates to screen coordinates (for active canvas drawing)
   */
  function documentToScreen(point) {
    const vv = window.visualViewport;
    const offsetX = vv ? vv.offsetLeft : 0;
    const offsetY = vv ? vv.offsetTop : 0;

    return {
      x: point.x - window.scrollX - offsetX,
      y: point.y - window.scrollY - offsetY
    };
  }

  /**
   * Get document coordinates directly from pointer event (for background canvas ops)
   */
  function getDocumentPoint(e) {
    return {
      x: e.pageX,
      y: e.pageY,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };
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
      if (state.currentStroke) return;

      try {
        const newViewId = getCurrentViewId();
        if (newViewId !== state.currentViewId) {
          state.strokesByView[state.currentViewId] = state.strokes;
          state.currentViewId = newViewId;
          state.strokes = state.strokesByView[newViewId] || [];
          state.undoStack = [];
          state.redoStack = [];
          invalidatePathCache();
          redrawBackground();
        }
      } catch (err) {
        console.error('View change error:', err);
      }
    });

    views.forEach(view => {
      observer.observe(view, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // ========== v7.4: Dual Canvas Setup ==========

  function createCanvases() {
    // Background canvas: full document, position absolute
    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'annotation-canvas-bg';
    bgCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 9997;
    `;
    document.body.insertBefore(bgCanvas, document.body.firstChild);
    state.backgroundCanvas = bgCanvas;
    state.bgCtx = bgCanvas.getContext('2d', { willReadFrequently: false });

    // Active canvas: viewport-sized, position fixed (for live drawing)
    const activeCanvas = document.createElement('canvas');
    activeCanvas.id = 'annotation-canvas-active';
    activeCanvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 9998;
    `;
    document.body.appendChild(activeCanvas);
    state.activeCanvas = activeCanvas;
    state.activeCtx = activeCanvas.getContext('2d', { willReadFrequently: false });

    resizeBackgroundCanvas();
    resizeActiveCanvas();
  }

  function resizeBackgroundCanvas() {
    const canvas = state.backgroundCanvas;
    state.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);

    const docWidth = Math.max(
      document.body.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.scrollWidth,
      document.documentElement.offsetWidth,
      document.documentElement.clientWidth
    );

    let docHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight
    );

    if (docHeight > CONFIG.maxCanvasHeight) {
      docHeight = CONFIG.maxCanvasHeight;
    }

    canvas.width = docWidth * state.dpr;
    canvas.height = docHeight * state.dpr;
    canvas.style.width = docWidth + 'px';
    canvas.style.height = docHeight + 'px';

    state.bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.bgCtx.scale(state.dpr, state.dpr);

    state.pathCache.clear();
    updateViewportBounds();
    redrawBackground();
  }

  function resizeActiveCanvas() {
    const canvas = state.activeCanvas;
    const vv = window.visualViewport;
    const width = vv ? vv.width : window.innerWidth;
    const height = vv ? vv.height : window.innerHeight;

    canvas.width = width * state.dpr;
    canvas.height = height * state.dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    state.activeCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.activeCtx.scale(state.dpr, state.dpr);

    repositionActiveCanvas();
  }

  function updateViewportBounds() {
    const vv = window.visualViewport;
    const margin = 100;

    state.viewportBounds = {
      x: window.scrollX - margin,
      y: window.scrollY - margin,
      w: (vv?.width || window.innerWidth) + margin * 2,
      h: (vv?.height || window.innerHeight) + margin * 2
    };
  }

  function isStrokeVisible(stroke) {
    if (!state.viewportBounds || !stroke.bounds) return true;

    const b = stroke.bounds;
    const v = state.viewportBounds;

    return !(b.maxX < v.x || b.minX > v.x + v.w ||
             b.maxY < v.y || b.minY > v.y + v.h);
  }

  function calculateStrokeBounds(stroke) {
    if (stroke.bounds) return stroke.bounds;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of stroke.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    stroke.bounds = { minX, minY, maxX, maxY };
    return stroke.bounds;
  }

  function setupResizeHandler() {
    let resizeTimeout;

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeBackgroundCanvas();
        resizeActiveCanvas();
      }, 200);
    });

    window.addEventListener('scroll', updateViewportBounds, { passive: true });

    let lastHeight = 0;
    setInterval(() => {
      const currentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      );
      if (currentHeight !== lastHeight) {
        lastHeight = currentHeight;
        resizeBackgroundCanvas();
      }
    }, 1000);
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

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ann-btn ann-toggle';
    toggleBtn.dataset.action = 'toggle';
    toggleBtn.title = 'Toggle Draw Mode';
    toggleBtn.appendChild(createSVG('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'));
    toolbar.appendChild(toggleBtn);

    const tools = document.createElement('div');
    tools.className = 'ann-tools';
    tools.style.display = 'none';

    const penBtn = document.createElement('button');
    penBtn.className = 'ann-btn active';
    penBtn.dataset.tool = 'pen';
    penBtn.title = 'Pen';
    penBtn.appendChild(createSVG('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z', 20));
    tools.appendChild(penBtn);

    const highlightBtn = document.createElement('button');
    highlightBtn.className = 'ann-btn';
    highlightBtn.dataset.tool = 'highlighter';
    highlightBtn.title = 'Highlighter';
    highlightBtn.appendChild(createSVG('M4 19h16v2H4v-2zm3-4h2v3H7v-3zm4-3h2v6h-2v-6zm4-3h2v9h-2V9zm4-3h2v12h-2V6z', 20));
    tools.appendChild(highlightBtn);

    const eraserBtn = document.createElement('button');
    eraserBtn.className = 'ann-btn';
    eraserBtn.dataset.tool = 'eraser';
    eraserBtn.title = 'Eraser';
    eraserBtn.appendChild(createSVG('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', 20));
    tools.appendChild(eraserBtn);

    const rulerBtn = document.createElement('button');
    rulerBtn.className = 'ann-btn';
    rulerBtn.dataset.toggle = 'ruler';
    rulerBtn.title = 'Ruler toggle (straight lines)';
    rulerBtn.appendChild(createSVG('M3 5v14h2V5H3zm4 0v14h1V5H7zm3 0v14h1V5h-1zm3 0v14h1V5h-1zm3 0v14h2V5h-2zm4 0v14h2V5h-2z', 20));
    tools.appendChild(rulerBtn);

    const selectBtn = document.createElement('button');
    selectBtn.className = 'ann-btn';
    selectBtn.dataset.tool = 'select';
    selectBtn.title = 'Select & Move';
    selectBtn.appendChild(createSVG('M3 3h8v2H5v6H3V3zm18 0v8h-2V5h-6V3h8zM3 13v8h8v-2H5v-6H3zm18 0v6h-6v2h8v-8h-2z', 20));
    tools.appendChild(selectBtn);

    const divider1 = document.createElement('div');
    divider1.className = 'ann-divider';
    tools.appendChild(divider1);

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

    const divider2 = document.createElement('div');
    divider2.className = 'ann-divider';
    tools.appendChild(divider2);

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

    const divider3 = document.createElement('div');
    divider3.className = 'ann-divider';
    tools.appendChild(divider3);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'ann-btn';
    undoBtn.dataset.action = 'undo';
    undoBtn.title = 'Undo';
    undoBtn.appendChild(createSVG('M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z', 20));
    tools.appendChild(undoBtn);

    const redoBtn = document.createElement('button');
    redoBtn.className = 'ann-btn';
    redoBtn.dataset.action = 'redo';
    redoBtn.title = 'Redo';
    redoBtn.appendChild(createSVG('M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z', 20));
    tools.appendChild(redoBtn);

    const divider4 = document.createElement('div');
    divider4.className = 'ann-divider';
    tools.appendChild(divider4);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'ann-btn';
    clearBtn.dataset.action = 'clear';
    clearBtn.title = 'Clear (hold 1.5s for ALL sections)';
    clearBtn.appendChild(createSVG('M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12z', 20));
    tools.appendChild(clearBtn);

    toolbar.appendChild(tools);
    document.body.appendChild(toolbar);

    setupToolbarEvents(toolbar);
  }

  function setupToolbarEvents(toolbar) {
    let clearPressTimer = null;
    let didLongPress = false;
    const clearBtn = toolbar.querySelector('[data-action="clear"]');

    if (clearBtn) {
      clearBtn.addEventListener('pointerdown', () => {
        didLongPress = false;
        clearPressTimer = setTimeout(() => {
          didLongPress = true;
          if (confirm('Clear ALL annotations for ALL sections?')) {
            pushToUndoStack();
            state.strokes = [];
            state.strokesByView = {};
            localforage.removeItem(getStorageKey());
            invalidatePathCache();
            redrawBackground();
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
        pushToUndoStack();
        state.strokes = [];
        state.strokesByView[state.currentViewId] = [];
        invalidatePathCache();
        redrawBackground();
        saveAnnotations();
      } else if (btn.dataset.action === 'undo') {
        undo();
      } else if (btn.dataset.action === 'redo') {
        redo();
      } else if (btn.dataset.tool) {
        if (state.currentTool === 'select' && btn.dataset.tool !== 'select') {
          state.selectionRect = null;
          state.selectedStrokes = [];
          state.selectionStart = null;
          redrawBackground();
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

    // v7.4: Enable pointer events on ACTIVE canvas (not background)
    state.activeCanvas.style.pointerEvents = state.isDrawMode ? 'auto' : 'none';
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

    // v7.4: Events on ACTIVE canvas
    state.activeCanvas.addEventListener('pointerdown', boundPointerDown);
    state.activeCanvas.addEventListener('pointermove', boundPointerMove);
    state.activeCanvas.addEventListener('pointerup', boundPointerUp);
    state.activeCanvas.addEventListener('pointerleave', boundPointerUp);
    state.activeCanvas.addEventListener('pointercancel', boundPointerUp);

    state.activeCanvas.addEventListener('touchstart', boundTouchStart, { passive: false });
    state.activeCanvas.addEventListener('touchmove', boundTouchMove, { passive: false });
  }

  function removeDrawingEvents() {
    state.activeCanvas.removeEventListener('pointerdown', boundPointerDown);
    state.activeCanvas.removeEventListener('pointermove', boundPointerMove);
    state.activeCanvas.removeEventListener('pointerup', boundPointerUp);
    state.activeCanvas.removeEventListener('pointerleave', boundPointerUp);
    state.activeCanvas.removeEventListener('pointercancel', boundPointerUp);

    state.activeCanvas.removeEventListener('touchstart', boundTouchStart);
    state.activeCanvas.removeEventListener('touchmove', boundTouchMove);
  }

  function handleTouchStart(e) {
    if (e.touches.length > 1) {
      return;
    }
    if (state.isActivelyDrawing) {
      e.preventDefault();
    }
  }

  function handleTouchMove(e) {
    if (state.isActivelyDrawing) {
      e.preventDefault();
    }
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

    // v7.4: Use screen coordinates for active canvas
    const screenPoint = getScreenPoint(e);
    const docPoint = screenToDocument(screenPoint);

    if (state.currentTool === 'eraser') {
      pushToUndoStack();
      eraseAtPoint(docPoint);
      state.isActivelyDrawing = true;
      state.activeCanvas.setPointerCapture(e.pointerId);
      return;
    }

    // Ruler mode
    if (state.rulerEnabled && (state.currentTool === 'pen' || state.currentTool === 'highlighter')) {
      state.rulerStart = { screen: screenPoint, doc: docPoint };
      state.isActivelyDrawing = true;
      state.activeCanvas.setPointerCapture(e.pointerId);
      return;
    }

    // Selection tool
    if (state.currentTool === 'select') {
      if (state.selectionRect && isInsideRect(docPoint, state.selectionRect)) {
        pushToUndoStack();
        state.isDraggingSelection = true;
        state.dragOffset = {
          x: docPoint.x - state.selectionRect.x,
          y: docPoint.y - state.selectionRect.y
        };
        state.isActivelyDrawing = true;
        state.activeCanvas.setPointerCapture(e.pointerId);
        return;
      }

      const handle = getResizeHandle(docPoint);
      if (handle) {
        pushToUndoStack();
        state.isResizingSelection = true;
        state.resizeHandle = handle;
        state.originalBounds = { ...state.selectionRect };
        state.isActivelyDrawing = true;
        state.activeCanvas.setPointerCapture(e.pointerId);
        return;
      }

      state.selectionStart = docPoint;
      state.selectedStrokes = [];
      state.selectionRect = null;
      state.isActivelyDrawing = true;
      state.activeCanvas.setPointerCapture(e.pointerId);
      return;
    }

    // Regular stroke
    pushToUndoStack();
    state.lastPointTime = performance.now();
    state.isActivelyDrawing = true;

    // v7.4: Store SCREEN coords during drawing for active canvas
    state.currentStroke = {
      tool: state.currentTool,
      color: state.currentColor,
      sizeMultiplier: state.sizeMultiplier,
      points: [screenPoint],       // Screen coords for live drawing
      docPoints: [docPoint]        // Doc coords for storage
    };

    state.activeCanvas.setPointerCapture(e.pointerId);
  }

  function processPoint(e, forceProcess = false) {
    const screenPoint = getScreenPoint(e);
    const docPoint = screenToDocument(screenPoint);

    if (!state.currentStroke) return;

    const lastPoint = state.currentStroke.points[state.currentStroke.points.length - 1];
    if (!forceProcess && !shouldAddPoint(screenPoint, lastPoint)) return;

    state.currentStroke.points.push(screenPoint);
    state.currentStroke.docPoints.push(docPoint);
    return true;
  }

  function handlePointerMove(e) {
    if (isPalmTouch(e)) return;

    const screenPoint = getScreenPoint(e);
    const docPoint = screenToDocument(screenPoint);

    if (state.currentTool === 'eraser' && e.buttons > 0) {
      eraseAtPoint(docPoint);
      return;
    }

    // Ruler preview
    if (state.rulerEnabled && state.rulerStart && e.buttons > 0) {
      const snappedEnd = snapToAngle(state.rulerStart.screen, screenPoint);
      clearActiveCanvas();
      drawRulerPreviewOnActive(state.rulerStart.screen, snappedEnd);
      return;
    }

    // Selection tool
    if (state.currentTool === 'select') {
      if (state.isDraggingSelection && e.buttons > 0) {
        moveSelection(docPoint);
        return;
      }
      if (state.isResizingSelection && e.buttons > 0) {
        resizeSelection(docPoint);
        return;
      }
      if (state.selectionStart && e.buttons > 0) {
        redrawBackground();
        drawSelectionPreviewOnBackground(state.selectionStart, docPoint);
        return;
      }
    }

    if (!state.currentStroke) return;

    // v7.4: Use getCoalescedEvents for smooth Apple Pencil input
    let pointsAdded = 0;

    if (CONFIG.useCoalescedEvents && e.getCoalescedEvents) {
      const events = e.getCoalescedEvents();
      for (const coalescedEvent of events) {
        if (processPoint(coalescedEvent)) {
          pointsAdded++;
        }
      }
    } else {
      if (processPoint(e)) {
        pointsAdded++;
      }
    }

    // v7.4: Draw on ACTIVE canvas (small, fast!)
    if (pointsAdded > 0) {
      drawIncrementalOnActive(state.currentStroke);
    }
  }

  function handlePointerUp(e) {
    state.isActivelyDrawing = false;

    // Selection tool finalization
    if (state.currentTool === 'select') {
      if (state.isDraggingSelection) {
        state.isDraggingSelection = false;
        invalidatePathCache();
        scheduleSave();
        try { state.activeCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (state.isResizingSelection) {
        state.isResizingSelection = false;
        state.resizeHandle = null;
        state.originalBounds = null;
        invalidatePathCache();
        scheduleSave();
        try { state.activeCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
      if (state.selectionStart) {
        const docPoint = screenToDocument(getScreenPoint(e));
        finalizeSelection(docPoint);
        state.selectionStart = null;
        try { state.activeCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
        return;
      }
    }

    // Ruler finalization
    if (state.rulerEnabled && state.rulerStart) {
      const screenPoint = getScreenPoint(e);
      const snappedScreenEnd = snapToAngle(state.rulerStart.screen, screenPoint);
      const snappedDocEnd = screenToDocument(snappedScreenEnd);

      const dx = snappedDocEnd.x - state.rulerStart.doc.x;
      const dy = snappedDocEnd.y - state.rulerStart.doc.y;
      if (Math.hypot(dx, dy) > 5) {
        const stroke = {
          tool: state.currentTool,
          color: state.currentColor,
          sizeMultiplier: state.sizeMultiplier,
          points: [state.rulerStart.doc, snappedDocEnd]
        };
        calculateStrokeBounds(stroke);
        state.strokes.push(stroke);
        scheduleSave();
      }

      state.rulerStart = null;
      clearActiveCanvas();
      redrawBackground();
      try { state.activeCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }

    // v7.4: Transfer stroke from active canvas to background
    if (state.currentStroke && state.currentStroke.docPoints.length > 1) {
      // Create final stroke with document coordinates
      const finalStroke = {
        tool: state.currentStroke.tool,
        color: state.currentStroke.color,
        sizeMultiplier: state.currentStroke.sizeMultiplier,
        points: state.currentStroke.docPoints
      };
      calculateStrokeBounds(finalStroke);
      state.strokes.push(finalStroke);
      scheduleSave();

      // Clear active canvas and redraw background with new stroke
      clearActiveCanvas();
      redrawBackground();
    }

    state.currentStroke = null;
    state.lastPointTime = 0;

    try { state.activeCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  // ========== Point Processing ==========
  function shouldAddPoint(newPoint, lastPoint) {
    if (!lastPoint) return true;
    const dx = newPoint.x - lastPoint.x;
    const dy = newPoint.y - lastPoint.y;
    return Math.hypot(dx, dy) >= CONFIG.minPointDistance;
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

  // ========== v7.4: Active Canvas Drawing ==========

  function clearActiveCanvas() {
    const ctx = state.activeCtx;
    const canvas = state.activeCanvas;
    ctx.clearRect(0, 0, canvas.width / state.dpr, canvas.height / state.dpr);
  }

  /**
   * v7.4: Draw incremental segment on ACTIVE canvas (FAST - small canvas!)
   */
  function drawIncrementalOnActive(stroke) {
    const ctx = state.activeCtx;
    const points = stroke.points;  // Screen coordinates
    const len = points.length;

    if (len < 2) return;

    const tool = CONFIG.tools[stroke.tool];
    const sizeMult = stroke.sizeMultiplier || 1;

    const prev = points[len - 2];
    const curr = points[len - 1];
    const baseWidth = tool.minWidth + (curr.pressure * (tool.maxWidth - tool.minWidth));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;
    ctx.lineWidth = baseWidth * sizeMult;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }

  function drawRulerPreviewOnActive(start, end) {
    const ctx = state.activeCtx;
    const tool = CONFIG.tools[state.currentTool];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = state.currentColor;
    ctx.globalAlpha = tool.opacity;
    ctx.lineWidth = (tool.minWidth + tool.maxWidth) / 2 * state.sizeMultiplier;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.restore();
  }

  // ========== Background Canvas Drawing ==========

  function invalidatePathCache() {
    state.pathCache.clear();
  }

  function getStrokePath(stroke) {
    const strokeId = stroke._id || (stroke._id = Math.random().toString(36).substr(2, 9));

    let cached = state.pathCache.get(strokeId);
    if (cached && cached.pointCount === stroke.points.length) {
      return cached.path;
    }

    const path = new Path2D();
    const points = stroke.points;

    if (points.length < 2) return path;

    path.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      if (i === 1) {
        path.lineTo(curr.x, curr.y);
      } else {
        const mid = {
          x: (prev.x + curr.x) / 2,
          y: (prev.y + curr.y) / 2
        };
        path.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      }
    }

    state.pathCache.set(strokeId, {
      path: path,
      pointCount: points.length
    });

    return path;
  }

  function drawFullStrokeOnBackground(stroke) {
    const ctx = state.bgCtx;
    const points = stroke.points;

    if (points.length < 2) return;

    calculateStrokeBounds(stroke);
    if (!isStrokeVisible(stroke)) return;

    const tool = CONFIG.tools[stroke.tool];

    const avgPressure = points.reduce((sum, p) => sum + (p.pressure || 0.5), 0) / points.length;
    const sizeMult = stroke.sizeMultiplier || 1;
    const baseWidth = tool.minWidth + (avgPressure * (tool.maxWidth - tool.minWidth));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;
    ctx.lineWidth = baseWidth * sizeMult;

    const path = getStrokePath(stroke);
    ctx.stroke(path);
  }

  function redrawBackground() {
    const ctx = state.bgCtx;
    const canvas = state.backgroundCanvas;

    updateViewportBounds();

    ctx.clearRect(0, 0, canvas.width / state.dpr, canvas.height / state.dpr);

    for (const stroke of state.strokes) {
      calculateStrokeBounds(stroke);
      if (!isStrokeVisible(stroke)) continue;
      drawFullStrokeOnBackground(stroke);
    }

    if (state.currentTool === 'select') {
      drawSelectionBoxOnBackground();
    }
  }

  function drawSelectionPreviewOnBackground(start, end) {
    const ctx = state.bgCtx;

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

    ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
    ctx.setLineDash([]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawSelectionBoxOnBackground() {
    if (!state.selectionRect || state.selectedStrokes.length === 0) return;

    const ctx = state.bgCtx;
    const rect = state.selectionRect;

    ctx.save();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

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
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    }

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

  function getStrokeBoundsForSelection(stroke) {
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
      redrawBackground();
      return;
    }

    state.selectedStrokes = state.strokes.filter(s => isStrokeInRect(s, rect));

    if (state.selectedStrokes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of state.selectedStrokes) {
        const b = getStrokeBoundsForSelection(stroke);
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

    redrawBackground();
  }

  function moveSelection(point) {
    const dx = point.x - state.dragOffset.x - state.selectionRect.x;
    const dy = point.y - state.dragOffset.y - state.selectionRect.y;

    for (const stroke of state.selectedStrokes) {
      // Invalidate bounds cache
      stroke.bounds = null;
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
    }

    state.selectionRect.x += dx;
    state.selectionRect.y += dy;

    redrawBackground();
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
      stroke.bounds = null;  // Invalidate bounds
      for (const p of stroke.points) {
        const relX = p.x - (orig.x + orig.w / 2);
        const relY = p.y - (orig.y + orig.h / 2);
        p.x = (newRect.x + newRect.w / 2) + relX * scaleX;
        p.y = (newRect.y + newRect.h / 2) + relY * scaleY;
      }
    }

    state.selectionRect = newRect;
    state.originalBounds = { ...newRect };

    redrawBackground();
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
      invalidatePathCache();
      redrawBackground();
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
    return 'annotations-v7-' + filename;  // Same key as v7 (compatible)
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
        redrawBackground();
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  }

  // ========== Start ==========
  init();
})();
