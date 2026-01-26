/**
 * Annotation Module v7.8 - SMOOTH LINES + ZOOM TOOLBAR + PERFORMANCE
 *
 * ARCHITECTURE:
 * - Single canvas, position: absolute (scrolls with document)
 * - All coordinates use pageX/pageY (zoom-independent!)
 *
 * v7.8 IMPROVEMENTS:
 * - SMOOTH LINES: Continuous path with circle stamps (no gaps)
 * - ZOOM TOOLBAR: Toolbar scales down during pinch-zoom
 * - PERFORMANCE: RAF batching, reduced context state changes
 * - Path2D caching for completed strokes
 * - Viewport culling (skip off-screen strokes)
 * - getCoalescedEvents for Apple Pencil batching
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
    maxVelocity: 1000,
    maxCanvasHeight: 32000,
    maxHistorySize: 50,
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
    canvas: null,
    ctx: null,
    dpr: 1,
    sizeMultiplier: 1,
    rulerStart: null,
    rulerEnabled: false,
    lastPointTime: 0,
    // Undo/Redo
    undoStack: [],
    redoStack: [],
    // Performance
    pathCache: new Map(),
    viewportBounds: null,
    rafId: null,           // v7.8: RAF batching
    lastDrawnIndex: 0,     // v7.8: Track last drawn point for smooth lines
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
    initViewTracking();
    createCanvas();
    createToolbar();
    setupToolbarViewportHandler();
    setupViewChangeListener();
    loadAnnotations();

    window.addEventListener('resize', debounce(resizeCanvas, 200));
    window.addEventListener('scroll', updateViewportBounds, { passive: true });
  }

  // ========== Utility Functions ==========
  function debounce(fn, ms) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function cloneStrokes(strokes) {
    return strokes.map(stroke => ({
      ...stroke,
      points: stroke.points.map(p => ({ ...p }))
    }));
  }

  // ========== Toolbar Viewport Handler ==========
  function setupToolbarViewportHandler() {
    if (!window.visualViewport) return;

    function repositionToolbar() {
      const toolbar = document.getElementById('annotation-toolbar');
      if (!toolbar) return;

      const vv = window.visualViewport;
      const scale = vv.scale || 1;

      // v7.8: Scale toolbar inversely to zoom (shrinks when zoomed in)
      const toolbarScale = Math.max(0.6, 1 / scale);  // Min 60% size

      toolbar.style.position = 'fixed';
      toolbar.style.left = (vv.offsetLeft + 10) + 'px';
      toolbar.style.bottom = 'auto';
      toolbar.style.top = (vv.offsetTop + vv.height - (toolbar.offsetHeight * toolbarScale) - 10) + 'px';
      toolbar.style.transform = `scale(${toolbarScale})`;
      toolbar.style.transformOrigin = 'bottom left';
    }

    window.visualViewport.addEventListener('resize', repositionToolbar);
    window.visualViewport.addEventListener('scroll', repositionToolbar);
  }

  // ========== Coordinate Function ==========
  /**
   * Get document coordinates from pointer event.
   * pageX/pageY ALWAYS work correctly regardless of zoom level!
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
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 9998;
    `;
    document.body.insertBefore(canvas, document.body.firstChild);
    state.canvas = canvas;
    state.ctx = canvas.getContext('2d', { willReadFrequently: false });

    resizeCanvas();
  }

  function resizeCanvas() {
    const canvas = state.canvas;
    state.dpr = window.devicePixelRatio || 1;

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

    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.scale(state.dpr, state.dpr);

    invalidatePathCache();
    updateViewportBounds();
    redrawAllStrokes();
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
    if (!stroke.points || stroke.points.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    const padding = 30;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  }

  // ========== Toolbar ==========
  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'annotation-toolbar';

    // Create style element
    const style = document.createElement('style');
    style.textContent = `
      #annotation-toolbar {
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: rgba(30, 30, 30, 0.95);
        border-radius: 12px;
        padding: 8px;
        display: flex;
        gap: 6px;
        align-items: center;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        touch-action: none;
      }
      #annotation-toolbar .ann-toggle {
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 8px;
        background: #4a4a4a;
        color: white;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      #annotation-toolbar .ann-toggle.active {
        background: #007AFF;
      }
      #annotation-toolbar .ann-tools {
        display: none;
        gap: 6px;
        align-items: center;
      }
      #annotation-toolbar .ann-btn {
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 8px;
        background: #4a4a4a;
        color: white;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      #annotation-toolbar .ann-btn.active {
        background: #007AFF;
      }
      #annotation-toolbar .ann-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      #annotation-toolbar .ann-divider {
        width: 1px;
        height: 30px;
        background: #555;
        margin: 0 4px;
      }
      #annotation-toolbar .ann-color {
        width: 32px;
        height: 32px;
        border: 2px solid transparent;
        border-radius: 50%;
        cursor: pointer;
        transition: transform 0.2s, border-color 0.2s;
      }
      #annotation-toolbar .ann-color.active {
        border-color: white;
        transform: scale(1.15);
      }
      #annotation-toolbar .ann-size-slider {
        width: 80px;
        height: 6px;
        -webkit-appearance: none;
        background: #555;
        border-radius: 3px;
        outline: none;
      }
      #annotation-toolbar .ann-size-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        cursor: pointer;
      }
    `;
    toolbar.appendChild(style);

    // Create toggle button
    const toggle = document.createElement('button');
    toggle.className = 'ann-toggle';
    toggle.title = 'Toggle Draw Mode';
    toggle.textContent = '\u270F\uFE0F';
    toolbar.appendChild(toggle);

    // Create tools container
    const tools = document.createElement('div');
    tools.className = 'ann-tools';

    // Tool buttons
    const toolButtons = [
      { tool: 'pen', title: 'Pen', icon: '\uD83D\uDD8A\uFE0F' },
      { tool: 'highlighter', title: 'Highlighter', icon: '\uD83D\uDD8D\uFE0F' },
      { tool: 'eraser', title: 'Eraser', icon: '\uD83E\uDDFB' },
      { tool: 'select', title: 'Select', icon: '\u2610' }
    ];

    toolButtons.forEach(({ tool, title, icon }) => {
      const btn = document.createElement('button');
      btn.className = 'ann-btn';
      btn.dataset.tool = tool;
      btn.title = title;
      btn.textContent = icon;
      tools.appendChild(btn);
    });

    tools.appendChild(createDivider());

    // Ruler button
    const rulerBtn = document.createElement('button');
    rulerBtn.className = 'ann-btn';
    rulerBtn.dataset.action = 'ruler';
    rulerBtn.title = 'Ruler';
    rulerBtn.textContent = '\uD83D\uDCCF';
    tools.appendChild(rulerBtn);

    tools.appendChild(createDivider());

    // Undo/Redo buttons
    const undoBtn = document.createElement('button');
    undoBtn.className = 'ann-btn';
    undoBtn.dataset.action = 'undo';
    undoBtn.title = 'Undo';
    undoBtn.textContent = '\u21A9\uFE0F';
    tools.appendChild(undoBtn);

    const redoBtn = document.createElement('button');
    redoBtn.className = 'ann-btn';
    redoBtn.dataset.action = 'redo';
    redoBtn.title = 'Redo';
    redoBtn.textContent = '\u21AA\uFE0F';
    tools.appendChild(redoBtn);

    tools.appendChild(createDivider());

    // Color buttons
    CONFIG.colors.forEach(color => {
      const colorBtn = document.createElement('div');
      colorBtn.className = 'ann-color';
      colorBtn.dataset.color = color;
      colorBtn.style.background = color;
      tools.appendChild(colorBtn);
    });

    tools.appendChild(createDivider());

    // Size slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'ann-size-slider';
    slider.min = '0.5';
    slider.max = '3';
    slider.step = '0.1';
    slider.value = '1';
    tools.appendChild(slider);

    tools.appendChild(createDivider());

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ann-btn';
    clearBtn.dataset.action = 'clear';
    clearBtn.title = 'Clear All';
    clearBtn.textContent = '\uD83D\uDDD1\uFE0F';
    tools.appendChild(clearBtn);

    toolbar.appendChild(tools);
    document.body.appendChild(toolbar);
    setupToolbarEvents(toolbar);
    updateToolbarState();
  }

  function createDivider() {
    const div = document.createElement('div');
    div.className = 'ann-divider';
    return div;
  }

  function setupToolbarEvents(toolbar) {
    const toggle = toolbar.querySelector('.ann-toggle');
    toggle.addEventListener('click', toggleDrawMode);

    toolbar.querySelectorAll('.ann-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currentTool = btn.dataset.tool;
        clearSelection();
        updateToolbarState();
      });
    });

    toolbar.querySelectorAll('.ann-color').forEach(el => {
      el.addEventListener('click', () => {
        state.currentColor = el.dataset.color;
        updateToolbarState();
      });
    });

    toolbar.querySelector('.ann-size-slider').addEventListener('input', (e) => {
      state.sizeMultiplier = parseFloat(e.target.value);
    });

    toolbar.querySelector('[data-action="ruler"]').addEventListener('click', () => {
      state.rulerEnabled = !state.rulerEnabled;
      updateToolbarState();
    });

    toolbar.querySelector('[data-action="undo"]').addEventListener('click', undo);
    toolbar.querySelector('[data-action="redo"]').addEventListener('click', redo);
    toolbar.querySelector('[data-action="clear"]').addEventListener('click', clearAllStrokes);
  }

  function updateToolbarState() {
    const toolbar = document.getElementById('annotation-toolbar');
    if (!toolbar) return;

    toolbar.querySelectorAll('.ann-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === state.currentTool);
    });

    toolbar.querySelectorAll('.ann-color').forEach(el => {
      el.classList.toggle('active', el.dataset.color === state.currentColor);
    });

    toolbar.querySelector('[data-action="ruler"]').classList.toggle('active', state.rulerEnabled);

    const undoBtn = toolbar.querySelector('[data-action="undo"]');
    const redoBtn = toolbar.querySelector('[data-action="redo"]');
    undoBtn.disabled = state.undoStack.length === 0;
    redoBtn.disabled = state.redoStack.length === 0;
  }

  function toggleDrawMode() {
    state.isDrawMode = !state.isDrawMode;

    const toolbar = document.getElementById('annotation-toolbar');
    const tools = toolbar.querySelector('.ann-tools');
    const toggle = toolbar.querySelector('.ann-toggle');

    // v7.8: touch-action prevents scrolling during drawing
    state.canvas.style.pointerEvents = state.isDrawMode ? 'auto' : 'none';
    state.canvas.style.touchAction = state.isDrawMode ? 'none' : 'auto';
    tools.style.display = state.isDrawMode ? 'flex' : 'none';
    toggle.classList.toggle('active', state.isDrawMode);

    if (state.isDrawMode) {
      setupDrawingEvents();
    } else {
      removeDrawingEvents();
    }
  }

  // ========== Undo/Redo ==========
  function pushToUndoStack() {
    state.undoStack.push(cloneStrokes(state.strokes));
    if (state.undoStack.length > CONFIG.maxHistorySize) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    updateToolbarState();
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(cloneStrokes(state.strokes));
    state.strokes = state.undoStack.pop();
    invalidatePathCache();
    redrawAllStrokes();
    scheduleSave();
    updateToolbarState();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(cloneStrokes(state.strokes));
    state.strokes = state.redoStack.pop();
    invalidatePathCache();
    redrawAllStrokes();
    scheduleSave();
    updateToolbarState();
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

  function handleTouchStart(e) {
    // v7.8: Prevent scroll on single touch, allow pinch-zoom
    if (e.touches.length === 1) {
      e.preventDefault();
    } else if (e.touches.length > 1) {
      if (state.currentStroke) {
        state.currentStroke = null;
        state.lastDrawnIndex = 0;
        redrawAllStrokes();
      }
    }
  }

  function handleTouchMove(e) {
    // v7.8: Prevent scroll on single touch
    if (e.touches.length === 1) {
      e.preventDefault();
    } else if (e.touches.length > 1 && state.currentStroke) {
      state.currentStroke = null;
      state.lastDrawnIndex = 0;
      redrawAllStrokes();
    }
  }

  function isPalmTouch(e) {
    if (e.pointerType === 'pen') return false;
    if (e.pointerType === 'touch') {
      const r = e.width && e.height ? Math.max(e.width, e.height) / 2 : 0;
      return r > CONFIG.palmRejectRadius;
    }
    return false;
  }

  function shouldAddPoint(point, lastPoint) {
    const dx = point.x - lastPoint.x;
    const dy = point.y - lastPoint.y;
    return Math.hypot(dx, dy) >= CONFIG.minPointDistance;
  }

  function getVelocityFactor(prevPoint, currPoint, timeDelta) {
    if (timeDelta === 0) return 1;
    const dx = currPoint.x - prevPoint.x;
    const dy = currPoint.y - prevPoint.y;
    const distance = Math.hypot(dx, dy);
    const velocity = distance / timeDelta;
    const normalized = Math.min(velocity / CONFIG.maxVelocity, 1);
    return 1 - (normalized * CONFIG.velocityWeight);
  }

  function handlePointerDown(e) {
    if (isPalmTouch(e)) return;

    // v7.8: Prevent default to stop scroll
    e.preventDefault();

    const point = getDocumentPoint(e);

    if (state.currentTool === 'eraser') {
      pushToUndoStack();
      eraseAtPoint(point);
      state.isActivelyDrawing = true;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (state.rulerEnabled && (state.currentTool === 'pen' || state.currentTool === 'highlighter')) {
      state.rulerStart = point;
      state.isActivelyDrawing = true;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (state.currentTool === 'select') {
      if (state.selectionRect && isInsideRect(point, state.selectionRect)) {
        pushToUndoStack();
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
        pushToUndoStack();
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
    pushToUndoStack();
    state.lastPointTime = performance.now();
    state.isActivelyDrawing = true;
    state.lastDrawnIndex = 0;  // v7.8: Reset for new stroke

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

    // v7.8: Prevent scroll while drawing
    if (state.isActivelyDrawing || state.currentStroke) {
      e.preventDefault();
    }

    const point = getDocumentPoint(e);

    if (state.currentTool === 'eraser' && e.buttons > 0) {
      eraseAtPoint(point);
      return;
    }

    if (state.rulerEnabled && state.rulerStart && e.buttons > 0) {
      const snappedEnd = snapToAngle(state.rulerStart, point);
      redrawAllStrokes();
      drawRulerPreview(state.rulerStart, snappedEnd);
      return;
    }

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

    // Process coalesced events for Apple Pencil
    let pointsAdded = 0;

    if (CONFIG.useCoalescedEvents && e.getCoalescedEvents) {
      const events = e.getCoalescedEvents();
      for (const coalescedEvent of events) {
        const coalescedPoint = getDocumentPoint(coalescedEvent);
        const lastPoint = state.currentStroke.points[state.currentStroke.points.length - 1];

        if (shouldAddPoint(coalescedPoint, lastPoint)) {
          const now = performance.now();
          const timeDelta = (now - state.lastPointTime) / 1000;
          coalescedPoint.velocityFactor = getVelocityFactor(lastPoint, coalescedPoint, timeDelta);
          state.lastPointTime = now;
          state.currentStroke.points.push(coalescedPoint);
          pointsAdded++;
        }
      }
    } else {
      const lastPoint = state.currentStroke.points[state.currentStroke.points.length - 1];
      if (shouldAddPoint(point, lastPoint)) {
        const now = performance.now();
        const timeDelta = (now - state.lastPointTime) / 1000;
        point.velocityFactor = getVelocityFactor(lastPoint, point, timeDelta);
        state.lastPointTime = now;
        state.currentStroke.points.push(point);
        pointsAdded++;
      }
    }

    // v7.8: Incremental drawing with smooth curves
    if (pointsAdded > 0) {
      drawIncrementalStroke(state.currentStroke, pointsAdded);
    }
  }

  function handlePointerUp(e) {
    state.isActivelyDrawing = false;

    if (state.currentTool === 'select') {
      if (state.isDraggingSelection) {
        state.isDraggingSelection = false;
        invalidatePathCache();
        scheduleSave();
        return;
      }
      if (state.isResizingSelection) {
        state.isResizingSelection = false;
        invalidatePathCache();
        scheduleSave();
        return;
      }
      if (state.selectionStart) {
        const endPoint = getDocumentPoint(e);
        finalizeSelection(state.selectionStart, endPoint);
        state.selectionStart = null;
        return;
      }
    }

    if (state.rulerEnabled && state.rulerStart) {
      const endPoint = getDocumentPoint(e);
      const snappedEnd = snapToAngle(state.rulerStart, endPoint);
      createRulerStroke(state.rulerStart, snappedEnd);
      state.rulerStart = null;
      return;
    }

    if (state.currentStroke && state.currentStroke.points.length > 1) {
      state.currentStroke.bounds = calculateStrokeBounds(state.currentStroke);
      state.strokes.push(state.currentStroke);
      invalidatePathCache();
      scheduleSave();
    }

    state.currentStroke = null;
    redrawAllStrokes();
  }

  // ========== Drawing Functions ==========

  /**
   * v7.8: Draw incremental stroke with smooth connections
   * Uses filled circles at joints to eliminate gaps between segments
   */
  function drawIncrementalStroke(stroke, pointsAdded) {
    const ctx = state.ctx;
    const points = stroke.points;
    const len = points.length;

    if (len < 2) return;

    const tool = CONFIG.tools[stroke.tool];
    const sizeMult = stroke.sizeMultiplier || 1;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;  // v7.8: For circle stamps
    ctx.globalAlpha = tool.opacity;

    // v7.8: Draw from last drawn index to current
    const startIdx = Math.max(1, state.lastDrawnIndex);

    for (let i = startIdx; i < len; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const prevWidth = tool.minWidth + (prev.pressure * (tool.maxWidth - tool.minWidth));
      const currWidth = tool.minWidth + (curr.pressure * (tool.maxWidth - tool.minWidth));
      const avgWidth = ((prevWidth + currWidth) / 2) * sizeMult;

      ctx.lineWidth = avgWidth;

      // Draw line segment
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();

      // v7.8: Draw filled circle at current point to cover any gaps
      ctx.beginPath();
      ctx.arc(curr.x, curr.y, avgWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // v7.8: Track last drawn index
    state.lastDrawnIndex = len - 1;

    ctx.globalAlpha = 1;
  }

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

    // End cap
    const last = points[points.length - 1];
    path.lineTo(last.x, last.y);

    state.pathCache.set(strokeId, {
      path: path,
      pointCount: points.length
    });

    return path;
  }

  function drawFullStroke(stroke) {
    if (!stroke.bounds) {
      stroke.bounds = calculateStrokeBounds(stroke);
    }

    if (!isStrokeVisible(stroke)) return;

    const ctx = state.ctx;
    const tool = CONFIG.tools[stroke.tool];
    const sizeMult = stroke.sizeMultiplier || 1;
    const avgPressure = stroke.points.reduce((a, p) => a + p.pressure, 0) / stroke.points.length;
    const baseWidth = tool.minWidth + (avgPressure * (tool.maxWidth - tool.minWidth));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;
    ctx.lineWidth = baseWidth * sizeMult;

    const path = getStrokePath(stroke);
    ctx.stroke(path);

    ctx.globalAlpha = 1;
  }

  function redrawAllStrokes() {
    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);

    updateViewportBounds();

    for (const stroke of state.strokes) {
      drawFullStroke(stroke);
    }

    if (state.currentStroke && state.currentStroke.points.length > 1) {
      drawCurrentStroke(state.currentStroke);
    }

    if (state.selectionRect) {
      drawSelectionBox();
    }
  }

  function drawCurrentStroke(stroke) {
    const ctx = state.ctx;
    const tool = CONFIG.tools[stroke.tool];
    const sizeMult = stroke.sizeMultiplier || 1;
    const points = stroke.points;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const baseWidth = tool.minWidth + (curr.pressure * (tool.maxWidth - tool.minWidth));
      const velocityMod = curr.velocityFactor || 1;
      ctx.lineWidth = baseWidth * sizeMult * velocityMod;

      if (i === 1) {
        ctx.lineTo(curr.x, curr.y);
      } else {
        const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
        ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
      }
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ========== Ruler ==========
  function snapToAngle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);
    const snapAngles = [0, Math.PI/6, Math.PI/4, Math.PI/3, Math.PI/2, 2*Math.PI/3, 3*Math.PI/4, 5*Math.PI/6, Math.PI];

    let closest = snapAngles[0];
    let minDiff = Math.abs(Math.abs(angle) - snapAngles[0]);

    for (const snap of snapAngles) {
      const diff = Math.abs(Math.abs(angle) - snap);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }

    const dist = Math.hypot(dx, dy);
    const snappedAngle = angle >= 0 ? closest : -closest;

    return {
      x: start.x + Math.cos(snappedAngle) * dist,
      y: start.y + Math.sin(snappedAngle) * dist,
      pressure: end.pressure || 0.5
    };
  }

  function drawRulerPreview(start, end) {
    const ctx = state.ctx;
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

  function createRulerStroke(start, end) {
    const stroke = {
      tool: state.currentTool,
      color: state.currentColor,
      sizeMultiplier: state.sizeMultiplier,
      points: [
        { ...start, pressure: 0.5 },
        { ...end, pressure: 0.5 }
      ]
    };
    stroke.bounds = calculateStrokeBounds(stroke);
    state.strokes.push(stroke);
    invalidatePathCache();
    redrawAllStrokes();
    scheduleSave();
  }

  // ========== Eraser ==========
  function eraseAtPoint(point) {
    const radius = CONFIG.tools.eraser.radius * state.sizeMultiplier;
    let erased = false;

    state.strokes = state.strokes.filter(stroke => {
      const hit = stroke.points.some(p =>
        Math.hypot(p.x - point.x, p.y - point.y) < radius
      );
      if (hit) erased = true;
      return !hit;
    });

    if (erased) {
      invalidatePathCache();
      redrawAllStrokes();
      scheduleSave();
    }
  }

  // ========== Selection Tool ==========
  function isInsideRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
           point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function getResizeHandle(point) {
    if (!state.selectionRect) return null;

    const r = state.selectionRect;
    const handleSize = 20;
    const handles = {
      'nw': { x: r.x, y: r.y },
      'ne': { x: r.x + r.width, y: r.y },
      'sw': { x: r.x, y: r.y + r.height },
      'se': { x: r.x + r.width, y: r.y + r.height }
    };

    for (const [name, pos] of Object.entries(handles)) {
      if (Math.abs(point.x - pos.x) < handleSize && Math.abs(point.y - pos.y) < handleSize) {
        return name;
      }
    }
    return null;
  }

  function drawSelectionPreview(start, end) {
    const ctx = state.ctx;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    ctx.save();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function finalizeSelection(start, end) {
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };

    if (rect.width < 10 || rect.height < 10) {
      clearSelection();
      redrawAllStrokes();
      return;
    }

    state.selectedStrokes = state.strokes.filter(stroke =>
      stroke.points.some(p => isInsideRect(p, rect))
    );

    if (state.selectedStrokes.length > 0) {
      state.selectionRect = rect;
    } else {
      state.selectionRect = null;
    }

    redrawAllStrokes();
  }

  function moveSelection(point) {
    const dx = point.x - state.dragOffset.x - state.selectionRect.x;
    const dy = point.y - state.dragOffset.y - state.selectionRect.y;

    state.selectionRect.x += dx;
    state.selectionRect.y += dy;

    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        p.x += dx;
        p.y += dy;
      }
      stroke.bounds = calculateStrokeBounds(stroke);
    }

    redrawAllStrokes();
  }

  function resizeSelection(point) {
    const o = state.originalBounds;
    const r = state.selectionRect;
    let scaleX = 1, scaleY = 1;
    let newX = r.x, newY = r.y;

    switch (state.resizeHandle) {
      case 'se':
        r.width = Math.max(20, point.x - r.x);
        r.height = Math.max(20, point.y - r.y);
        break;
      case 'sw':
        r.width = Math.max(20, r.x + r.width - point.x);
        r.height = Math.max(20, point.y - r.y);
        newX = point.x;
        break;
      case 'ne':
        r.width = Math.max(20, point.x - r.x);
        r.height = Math.max(20, r.y + r.height - point.y);
        newY = point.y;
        break;
      case 'nw':
        r.width = Math.max(20, r.x + r.width - point.x);
        r.height = Math.max(20, r.y + r.height - point.y);
        newX = point.x;
        newY = point.y;
        break;
    }

    scaleX = r.width / o.width;
    scaleY = r.height / o.height;
    r.x = newX;
    r.y = newY;

    for (const stroke of state.selectedStrokes) {
      for (const p of stroke.points) {
        p.x = r.x + (p.x - o.x) * scaleX;
        p.y = r.y + (p.y - o.y) * scaleY;
      }
      stroke.bounds = calculateStrokeBounds(stroke);
    }

    redrawAllStrokes();
  }

  function drawSelectionBox() {
    const ctx = state.ctx;
    const r = state.selectionRect;

    ctx.save();
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(r.x, r.y, r.width, r.height);

    // Draw resize handles
    const handleSize = 10;
    ctx.fillStyle = '#007AFF';
    const handles = [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
      { x: r.x + r.width, y: r.y + r.height }
    ];
    for (const h of handles) {
      ctx.fillRect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
    }

    ctx.restore();
  }

  function clearSelection() {
    state.selectionRect = null;
    state.selectedStrokes = [];
    state.isDraggingSelection = false;
    state.isResizingSelection = false;
  }

  // ========== Clear All ==========
  function clearAllStrokes() {
    if (state.strokes.length === 0) return;
    pushToUndoStack();
    state.strokes = [];
    clearSelection();
    invalidatePathCache();
    redrawAllStrokes();
    scheduleSave();
  }

  // ========== Storage ==========
  let saveTimeout;

  function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveAnnotations, CONFIG.saveDebounce);
  }

  function getStorageKey() {
    const path = window.location.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1) || 'default';
    return `annotations-v7-${filename}`;
  }

  function saveAnnotations() {
    try {
      state.strokesByView[state.currentViewId] = state.strokes;

      const data = {};
      for (const [viewId, viewStrokes] of Object.entries(state.strokesByView)) {
        if (viewStrokes.length > 0) {
          data[viewId] = viewStrokes;
        }
      }

      if (typeof localforage !== 'undefined') {
        localforage.setItem(getStorageKey(), data);
      } else {
        localStorage.setItem(getStorageKey(), JSON.stringify(data));
      }
    } catch (err) {
      console.error('Error saving annotations:', err);
    }
  }

  async function loadAnnotations() {
    try {
      let data;
      if (typeof localforage !== 'undefined') {
        data = await localforage.getItem(getStorageKey());
      } else {
        const stored = localStorage.getItem(getStorageKey());
        data = stored ? JSON.parse(stored) : null;
      }

      if (data) {
        state.strokesByView = data;
        state.strokes = data[state.currentViewId] || [];

        for (const stroke of state.strokes) {
          stroke.bounds = calculateStrokeBounds(stroke);
        }

        redrawAllStrokes();
      }
    } catch (err) {
      console.error('Error loading annotations:', err);
    }
  }

  // Start
  init();
})();
