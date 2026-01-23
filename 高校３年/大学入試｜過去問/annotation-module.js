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
    smoothing: 0.3
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
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
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
    state.dpr = window.devicePixelRatio || 1;

    canvas.width = window.innerWidth * state.dpr;
    canvas.height = window.innerHeight * state.dpr;

    state.ctx.scale(state.dpr, state.dpr);
    redrawAllStrokes();
  }

  function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    });
  }

  function setupScrollHandler() {
    window.addEventListener('scroll', () => {
      // DEBUG: Log scroll redraw
      console.log('[Scroll] scrollY:', Math.round(window.scrollY), 'strokes:', state.strokes.length);
      redrawAllStrokes();
    }, { passive: true });
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

    // Ruler button
    const rulerBtn = document.createElement('button');
    rulerBtn.className = 'ann-btn';
    rulerBtn.dataset.tool = 'ruler';
    rulerBtn.title = 'Ruler (straight line, 45° snap)';
    rulerBtn.appendChild(createSVG('M3 5v14h2V5H3zm4 0v14h1V5H7zm3 0v14h1V5h-1zm3 0v14h1V5h-1zm3 0v14h2V5h-2zm4 0v14h2V5h-2z', 20));
    tools.appendChild(rulerBtn);

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
      const btn = e.target.closest('[data-action], [data-tool], [data-color], [data-size]');
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

    // Ruler: record start point only
    if (state.currentTool === 'ruler') {
      state.rulerStart = point;
      state.canvas.setPointerCapture(e.pointerId);
      return;
    }

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

    // Ruler: show preview line with angle snapping
    if (state.currentTool === 'ruler' && state.rulerStart && e.buttons > 0) {
      const snappedEnd = snapToAngle(state.rulerStart, point);
      redrawAllStrokes();
      drawRulerPreview(state.rulerStart, snappedEnd);
      return;
    }

    if (!state.currentStroke) return;

    state.currentStroke.points.push(point);
    drawStrokeSegment(state.currentStroke);
  }

  function handlePointerUp(e) {
    // Ruler: finalize the straight line
    if (state.currentTool === 'ruler' && state.rulerStart) {
      const point = getPoint(e);
      const snappedEnd = snapToAngle(state.rulerStart, point);

      // Only save if there's actual distance
      const dx = snappedEnd.x - state.rulerStart.x;
      const dy = snappedEnd.y - state.rulerStart.y;
      if (Math.hypot(dx, dy) > 5) {
        const stroke = {
          tool: 'pen',
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

    // Release pointer capture to prevent stuck state
    try {
      state.canvas.releasePointerCapture(e.pointerId);
    } catch (err) { /* ignore if not captured */ }
  }

  function getPoint(e) {
    const rect = state.canvas.getBoundingClientRect();
    const clientY = e.clientY - rect.top;
    const scrollY = window.scrollY;
    const docY = clientY + scrollY;
    // DEBUG: Log coordinate calculation
    console.log('[getPoint] clientY:', Math.round(clientY), 'scrollY:', Math.round(scrollY), 'docY:', Math.round(docY));
    return {
      x: e.clientX - rect.left,
      y: docY,  // Store document-relative Y
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
    };
  }

  // ========== Drawing ==========
  function drawStrokeSegment(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;
    const len = points.length;
    const scrollY = Math.round(window.scrollY);  // Round for consistent rendering

    if (len < 2) return;

    const tool = CONFIG.tools[stroke.tool];
    const p1 = points[len - 2];
    const p2 = points[len - 1];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    // Pressure-sensitive width with size multiplier
    const sizeMult = stroke.sizeMultiplier || 1;
    const width = (tool.minWidth + (p2.pressure * (tool.maxWidth - tool.minWidth))) * sizeMult;
    ctx.lineWidth = width;

    // For highlighter, draw the full visible stroke to avoid segment gaps
    if (stroke.tool === 'highlighter') {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y - scrollY);
      for (let i = 1; i < len; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        if (i === 1) {
          ctx.lineTo(curr.x, curr.y - scrollY);
        } else {
          const mid = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 - scrollY };
          ctx.quadraticCurveTo(prev.x, prev.y - scrollY, mid.x, mid.y);
        }
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.beginPath();

    if (len === 2) {
      ctx.moveTo(p1.x, p1.y - scrollY);
      ctx.lineTo(p2.x, p2.y - scrollY);
    } else {
      // Quadratic Bézier for smoothing
      const p0 = points[len - 3];
      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 - scrollY };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - scrollY };

      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(p1.x, p1.y - scrollY, mid2.x, mid2.y);
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
  }

  function drawFullStroke(stroke) {
    const ctx = state.ctx;
    const points = stroke.points;
    const scrollY = Math.round(window.scrollY);  // Round for consistent rendering

    if (points.length < 2) return;

    // DEBUG: Log first point's Y transformation
    const firstY = points[0].y;
    const renderY = firstY - scrollY;
    console.log('[drawFullStroke] storedY:', Math.round(firstY), 'scrollY:', scrollY, 'renderY:', Math.round(renderY));

    const tool = CONFIG.tools[stroke.tool];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = tool.opacity;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y - scrollY);

    const sizeMult = stroke.sizeMultiplier || 1;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];

      const width = (tool.minWidth + (p1.pressure * (tool.maxWidth - tool.minWidth))) * sizeMult;
      ctx.lineWidth = width;

      if (i === 1) {
        ctx.lineTo(p1.x, p1.y - scrollY);
      } else {
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 - scrollY };
        ctx.quadraticCurveTo(p0.x, p0.y - scrollY, mid.x, mid.y);
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
    const scrollY = window.scrollY;
    const tool = CONFIG.tools.pen;

    ctx.save();
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = tool.maxWidth * state.sizeMultiplier;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y - scrollY);
    ctx.lineTo(end.x, end.y - scrollY);
    ctx.stroke();
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
      console.log('[loadAnnotations] key:', key, 'viewId:', state.currentViewId, 'saved:', saved ? (Array.isArray(saved) ? 'array' : 'object') : 'null');

      if (saved && typeof saved === 'object') {
        // Check if it's old format (array) or new format (object with views)
        if (Array.isArray(saved)) {
          // Old format: migrate to new per-view format
          console.log('[loadAnnotations] Migrating old array format');
          state.strokesByView = { [state.currentViewId]: saved };
          state.strokes = saved;
        } else {
          // New format: load all views
          console.log('[loadAnnotations] Loading new object format, views:', Object.keys(saved));
          state.strokesByView = saved;
          state.strokes = saved[state.currentViewId] || [];
        }
        console.log('[loadAnnotations] Loaded', state.strokes.length, 'strokes for view', state.currentViewId);
        redrawAllStrokes();
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  }

  // ========== Start ==========
  init();
})();
