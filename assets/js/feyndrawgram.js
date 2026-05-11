/* ### Global state, global variables and so on ############################# */
let state = {
  mode:      'select', // point, line, text, select
  gridSize:  40,
  selection: [],  // IDs of selected objects
  history:   [],  // for Undo
  redoStack: [],  // for Redo
  
  // Objects databases
  nodes:  [],
  edges:  [],
  labels: [],
  shapes: [],
};

// State variables
let isDrawingLine   = false;
let lineStartCoords = null;
let isDragging      = false;
let dragTarget      = null;
let hasDragged      = false;
let clipboard       = null;
let isPasting       = false;
let lastMouseCoords = null;
let currentMousePos = { x: 0, y: 0 };
let objectClickedInMousedown = false;

// References to GUI elements
const propPanel      = document.getElementById('properties-panel');
const inputs         = document.getElementById(
  'properties-panel'
).querySelectorAll('input, select');
const inColor             = document.getElementById('prop-color');
const defaultColor        = "#000000";
const inWidth             = document.getElementById('prop-width');
const defaultWidth        = 2;
const inNodeStyle         = document.getElementById('prop-node-style');
const defaultNodeStyle    = "solid";
const inNodeRadius        = document.getElementById('prop-node-radius');
const defaultNodeRadius   = 5;
const inLineType          = document.getElementById('prop-line-type');
const defaultLineType     = "solid";
const inDashLength        = document.getElementById('prop-dash-length');
const defaultDashLength   = "5";
const inArrowSize         = document.getElementById('prop-arrow-size');
const defaultArrowSize    = "20";
const inArrowStart        = document.getElementById('prop-arrow-start');
const defaultArrowStart   = false;
const inArrowMid          = document.getElementById('prop-arrow-mid');
const defaultArrowMid     = false;
const inArrowEnd          = document.getElementById('prop-arrow-end');
const defaultArrowEnd     = false;
const inArrowFlip         = document.getElementById('prop-arrow-flip');
const defaultArrowFlip    = false;
const inMultiplicity      = document.getElementById('prop-multiplicity');
const defaultMultiplicity = 1;
const inFillType          = document.getElementById('prop-fill-type');
const defaultFillType     = "solid";
const inFillColor         = document.getElementById('prop-fill-color');
const defaultFillColor    = "#ffffff";
const inPatAngle          = document.getElementById('prop-pat-angle');
const defaultPatAngle     = 45;
const inPatColor          = document.getElementById('prop-pat-color');
const defaultPatColor     = "#000000";
const inPatWidth          = document.getElementById('prop-pat-width');
const defaultPatWidth     = 2;
const inPatSpacing        = document.getElementById('prop-pat-spacing');
const defaultPatSpacing   = 10;
const svg = document.getElementById('feynman-canvas');
const inExplicitWaves     = document.getElementById('prop-explicit-waves');

// Previews
/*
 *  Create previews
 */

function createPreview(tag) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  el.setAttribute("style","display: none; pointer-events: none; opacity: 0.5;");
  svg.appendChild(el);
  return el;
}
const previewPoint = createPreview("circle");
const previewLine  = createPreview("path");
const previewBlob  = createPreview("ellipse");
const previewBox   = createPreview("rect");
const selectionBox = document.createElementNS(
    "http://www.w3.org/2000/svg", "rect"
  );
  selectionBox.setAttribute( "fill",   "rgba(0,  63, 127, 0.1)" );
  selectionBox.setAttribute( "stroke", "rgba(0, 127, 255, 0.8)" );
  selectionBox.setAttribute( "style",  "display: none; pointer-events: none;" );
  svg.appendChild(selectionBox);

/* ### Drawing routines ##################################################### */
/*
 *  Draw an handle
 */
function drawHandle(id, x, y, cursorType, isShiftPress=false) {
  const size = 8;
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("id", id);
  rect.setAttribute("x", x - size / 2);
  rect.setAttribute("y", y - size / 2);
  rect.setAttribute("width", size);
  rect.setAttribute("height", size);
  rect.setAttribute("class", "handle");
  if(isShiftPress) {
    rect.setAttribute("fill", "#0000008f");
  } else {
    rect.setAttribute("fill", "#ffffff7f");
  }
  rect.setAttribute("transform", `rotate(45, ${x}, ${y})`);
  rect.style.cursor = cursorType;
  svg.appendChild(rect);
}

/*
 *  Hide Previews
 */
function hidePreviews() {
  previewPoint.style.display = "none";
  previewLine.style.display  = "none";
  previewBlob.style.display  = "none";
  previewBox.style.display   = "none";
};

/*
 *  Render the diagram objects
 */
function render(isShiftPress=false, targetSvg = svg) {
  const isMainCanvas = (targetSvg == svg);

  if(isMainCanvas) {
    updatePropertiesPanel();
  }

  // Delete old diagram
  if (isMainCanvas) {
    targetSvg.querySelectorAll('.diagram-object, .handle').forEach(el => el.remove());
  } else {
    while (targetSvg.firstChild) {
      targetSvg.removeChild(targetSvg.firstChild);
    }
  }
  
  //
  // 1. Draw lines and propagators
  //
  state.edges.forEach(edge => {
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const c = Math.sqrt(dx*dx + dy*dy);

    // Helper function (find the angle of the mid arrow)
    const getTangentAngle = (t) => {
      if (c < 0.1) {
        const aBase = edge.tadpoleAngle !== undefined ?
                        edge.tadpoleAngle :
                        -Math.PI/2;
        const startAngle = aBase + Math.PI;
        const currentAngle = edge.arrowFlip ?
                        startAngle - (t * 2 * Math.PI) :
                        startAngle + (t * 2 * Math.PI);
        return edge.arrowFlip ?
                        currentAngle - Math.PI/2 :
                        currentAngle + Math.PI/2;
      }
      if (edge.curvature === 0 || t === 0.5)
        return Math.atan2(dy, dx);
      
      const s = edge.curvature;
      const R = Math.abs( s / 2 + (c * c) / (8 * s) );
      const h = s - R * Math.sign(s);
      const cx_arc = ( edge.x1 + edge.x2 ) / 2 + (-dy/c) * h;
      const cy_arc = ( edge.y1 + edge.y2 ) / 2 + ( dx/c) * h;
      const a1 = Math.atan2( edge.y1 - cy_arc, edge.x1 - cx_arc );
      const a2 = Math.atan2( edge.y2 - cy_arc, edge.x2 - cx_arc );
      
      let diff = a2 - a1;
      while (diff >   Math.PI) diff -= 2 * Math.PI;
      while (diff <= -Math.PI) diff += 2 * Math.PI;
      if (s > 0 && diff > 0) diff -= 2 * Math.PI;
      if (s < 0 && diff < 0) diff += 2 * Math.PI;
      
      return a1 + diff * t + ( s > 0 ? -Math.PI/2 : Math.PI/2 );
    };

    // Base curve parametrization
    let L = 0;               // length
    let getBasePoint = null; // function: t in [0,1] -> {x, y, nx, ny, tx, ty}

    if (c < 0.1) {
      const R = (edge.curvature === 0 || Math.abs(edge.curvature) < 2) ?
                20 :
                Math.abs(edge.curvature);
      L = 2 * Math.PI * R;
      const aBase = edge.tadpoleAngle !== undefined ?
                    edge.tadpoleAngle : -Math.PI/2;
      const cxT   = edge.x1 + R * Math.cos(aBase);
      const cyT   = edge.y1 + R * Math.sin(aBase);
      const startAngle = aBase + Math.PI;

      getBasePoint = (t) => {
        const angle = edge.arrowFlip ?
                      startAngle - (t * 2 * Math.PI) :
                      startAngle + (t * 2 * Math.PI);
        const tang = getTangentAngle(t);
        return {
          x: cxT + R * Math.cos(angle),
          y: cyT + R * Math.sin(angle),
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang) // Normal vector
        };
      };
    } else if (edge.curvature === 0) {
      L = c;
      getBasePoint = (t) => {
        const tang = Math.atan2(dy, dx);
        return {
          x: edge.x1 + t * dx,
          y: edge.y1 + t * dy,
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang)
        };
      };
    } else {
      const s = edge.curvature;
      const R = Math.abs( s / 2 + (c * c) / (8 * s) );
      const h = s - R * Math.sign(s);
      const cx_arc = (edge.x1 + edge.x2) / 2 + (-dy/c) * h;
      const cy_arc = (edge.y1 + edge.y2) / 2 + ( dx/c) * h;
      const a1 = Math.atan2(edge.y1 - cy_arc, edge.x1 - cx_arc);
      const a2 = Math.atan2(edge.y2 - cy_arc, edge.x2 - cx_arc);
      
      let diff = a2 - a1;
      while (diff >   Math.PI) diff -= 2 * Math.PI;
      while (diff <= -Math.PI) diff += 2 * Math.PI;
      if (s > 0 && diff > 0) diff -= 2 * Math.PI;
      if (s < 0 && diff < 0) diff += 2 * Math.PI;
      
      L = R * Math.abs(diff);
      getBasePoint = (t) => {
        const currentAngle = a1 + diff * t;
        const tang = getTangentAngle(t);
        return {
          x: cx_arc + R * Math.cos(currentAngle),
          y: cy_arc + R * Math.sin(currentAngle),
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang)
        };
      };
    }

    // Paths generation
    const mult       = edge.multiplicity || defaultMultiplicity;
    const baseOffset = (edge.strokeWidth || defaultWidth) * 1;
    const offsets    = [];
    if (mult === 1) offsets.push(0);
    else if (mult === 2) offsets.push(-baseOffset, baseOffset);
    else if (mult === 3) offsets.push(-baseOffset * 1.5, 0, baseOffset * 1.5);

    let pathData = "";
    let hitboxData = "";

    offsets.forEach(offset => {
      if (edge.lineType === 'wavy' || edge.lineType === 'gluon') {
        const isGluon = edge.lineType === 'gluon';
        const lambda  =   isGluon ? 12 : 10;
        const A       = ( isGluon ? 5 : 3 ) / mult;
        const m       = Math.max(1, Math.round(L / lambda)); // Loop number
        const steps   = Math.max(20, Math.ceil(5 * L));
        
        for (let i = 0; i <= steps; i++) {
          const t     = i / steps;
          const pt    = getBasePoint(t);
          const phase = t * m * 2 * Math.PI;
          
          // Offset for parallel multiple lines
          const bx = pt.x + offset * pt.nx;
          const by = pt.y + offset * pt.ny;
          
          let px, py;
          if (isGluon) {
            // Gluon propagator
            px = bx + A * Math.sin(phase) * pt.nx +
                  A * (Math.cos(phase) - 1) * pt.tx;
            py = by + A * Math.sin(phase) * pt.ny +
                  A * (Math.cos(phase) - 1) * pt.ty;
          } else {
            // Photon propagator
            px = bx + A * Math.sin(phase) * pt.nx;
            py = by + A * Math.sin(phase) * pt.ny;
          }
          pathData += (i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`);
        }
      } else {
        // Straight lines
        const steps = edge.curvature === 0 ? 1 : Math.ceil(L / 2);
        for (let i = 0; i <= steps; i++) {
          const t  = i / steps;
          const pt = getBasePoint(t);
          const px = pt.x + offset * pt.nx;
          const py = pt.y + offset * pt.ny;
          pathData += (i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`);
        }
      }
    });

    // Hitbox
    const stepsHitbox = edge.curvature === 0 ? 1 : Math.ceil(L / 5);
    for (let i = 0; i <= stepsHitbox; i++) {
      const pt = getBasePoint(i / stepsHitbox);
      hitboxData += (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
    }

    // SVG render
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("id",           edge.id);
    path.setAttribute("d",            pathData);
    path.setAttribute("stroke",       edge.color       || defaultColor);
    path.setAttribute("stroke-width", edge.strokeWidth || defaultWidth);
    path.setAttribute("fill",         "none");
    path.setAttribute("class",        "diagram-object edge");
    
    if (edge.lineType === 'dashed') {
      const dL = edge.dashLength || defaultDashLength;
      path.setAttribute("stroke-dasharray", `${dL},${dL}`);
    }
    
    if (state.selection.includes(edge.id)) path.classList.add("selected");
    
    const hitbox = document.createElementNS(
      "http://www.w3.org/2000/svg", "path"
    );
    hitbox.setAttribute("id",     "hit_" + edge.id);
    hitbox.setAttribute("d",      hitboxData);
    hitbox.setAttribute("stroke", "transparent");
    hitbox.setAttribute("stroke-width",
                          Math.max(15,(edge.strokeWidth || defaultWidth)*2+10));
    hitbox.setAttribute("fill",   "none");
    hitbox.setAttribute("class",  "diagram-object");
    
    if(isMainCanvas) {
      targetSvg.appendChild(hitbox);
    }
    targetSvg.appendChild(path);

    // Arrows
    const drawArrow = (ax, ay, angle, offset = 0) => {
      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg", "path"
      );
      const s = edge.arrowSize || defaultArrowSize;
      const d = `M 0 0 L ${-s} ${-s/2.5} L ${-s*0.7} 0 L ${-s} ${s/2.5} Z`;
      if (edge.arrowFlip && c >= 0.1) angle += Math.PI;
      
      arrow.setAttribute("d",     d);
      arrow.setAttribute("fill",  edge.color || defaultColor);
      arrow.setAttribute("class", "diagram-object"); 
      arrow.setAttribute("style", "pointer-events: none;");
      arrow.setAttribute(
        "transform",
        `translate(${ax}, ${ay}) rotate(${angle * 180 / Math.PI}) `+
        `translate(${offset}, 0)`
      );
      if (state.selection.includes(edge.id) && isMainCanvas) {
        arrow.setAttribute("fill-opacity", "0.6");
      }
      targetSvg.appendChild(arrow);
    };

    const edgeThickness = edge.strokeWidth || defaultWidth;
    const endOffset     = edgeThickness * 1.5; 
    const midOffset     = (edge.arrowSize || 12) * 0.35;

    const ptStart = getBasePoint(0);
    const ptEnd   = getBasePoint(1);
    const ptMid   = getBasePoint(0.5);

    if (edge.arrowStart) drawArrow(
      ptStart.x, ptStart.y, getTangentAngle(0) + Math.PI, endOffset
    );
    if (edge.arrowEnd)   drawArrow(
      ptEnd.x,   ptEnd.y,   getTangentAngle(1),           endOffset
    );
    if (edge.arrowMid)   drawArrow(
      ptMid.x,   ptMid.y,   getTangentAngle(0.5),         midOffset
    );
  }); 

  //
  // Init Pattern generator
  //
  let dynamicDefs = document.getElementById('dynamic-defs');
  if (dynamicDefs) dynamicDefs.remove();
  dynamicDefs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  dynamicDefs.setAttribute("id", "dynamic-defs");
  targetSvg.appendChild(dynamicDefs);

  // Helper function for pattern
  const getFillAttribute = (obj) => {
    if (obj.fillType !== 'pattern') return obj.fillColor ||
      (
        obj.id.startsWith('node') && obj.nodeStyle==='solid' ?
          obj.color : 'none'
      );
    
    const patId = `pat_${obj.id}`;
    const s = obj.patSpacing || defaultPatSpacing;
    const pat = document.createElementNS(
      "http://www.w3.org/2000/svg", "pattern"
    );
    pat.setAttribute("id",     patId);
    pat.setAttribute("width",  s);
    pat.setAttribute("height", s);
    pat.setAttribute("patternUnits",     "userSpaceOnUse");
    pat.setAttribute("patternTransform",
      `rotate(${obj.patAngle || defaultPatAngle})`
    );
    
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width",  s);
    bg.setAttribute("height", s);
    bg.setAttribute("fill", obj.fillColor || defaultFillColor);
    pat.appendChild(bg);
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 0);  line.setAttribute("y1", 0);
    line.setAttribute("x2", 0);  line.setAttribute("y2", s);
    line.setAttribute("stroke",       obj.patColor || defaultPatColor);
    line.setAttribute("stroke-width", obj.patWidth || defaultPatWidth);
    pat.appendChild(line);
    
    dynamicDefs.appendChild(pat);
    return `url(#${patId})`;
  };

  //
  // 2. Shapes (Boxes and Blobs)
  //
  state.shapes.forEach(shape => {
    let el;
    if (shape.type === 'circle') {
      el = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      el.setAttribute("cx", shape.x);   el.setAttribute("cy", shape.y);
      el.setAttribute("rx", shape.rx);  el.setAttribute("ry", shape.ry);
    } else {
      el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      el.setAttribute("x", shape.x);
      el.setAttribute("y", shape.y);
      el.setAttribute("width",  shape.width);
      el.setAttribute("height", shape.height);
    }
    
    el.setAttribute("id",           shape.id);
    el.setAttribute("fill",         getFillAttribute(shape));
    el.setAttribute("stroke",       shape.color || defaultColor);
    el.setAttribute("stroke-width", shape.strokeWidth !== undefined ?
                                      shape.strokeWidth : 2);
    el.setAttribute("class", "diagram-object shape");
    if (state.selection.includes(shape.id) && isMainCanvas)
      el.classList.add("selected");

    targetSvg.appendChild(el);
  });

  //
  // 3. Vertex
  //
  state.nodes.forEach(node => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", node.id);
    g.setAttribute("class", "diagram-object node");
    g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
    if (state.selection.includes(node.id) && isMainCanvas)
      g.classList.add("selected");

    const r      = node.radius      || defaultNodeRadius;
    const stroke = node.color       || defaultColor;
    const sw     = node.strokeWidth || defaultWidth;
    const fill   = getFillAttribute(node);
    const style  = node.nodeStyle   || defaultNodeStyle;

    const appendCircle = (rad, f, s, w) => {
      const c = document.createElementNS(
        "http://www.w3.org/2000/svg", "circle"
      );
      c.setAttribute("cx",           0   );
      c.setAttribute("cy",           0   );
      c.setAttribute("r",            rad );
      c.setAttribute("fill",         f   );
      c.setAttribute("stroke",       s   );
      c.setAttribute("stroke-width", w   );
      g.appendChild(c);
    };

    if (style === 'solid') {
      appendCircle(r, node.fillType === 'solid' ? stroke : fill, stroke, sw);
    } else if (style === 'odot') {
      appendCircle(r, fill, stroke, sw);
      appendCircle(r/3, stroke, "none", 0);
    } else if (style === 'otimes') {
      appendCircle(r, fill, stroke, sw);
      const cross = document.createElementNS(
        "http://www.w3.org/2000/svg", "path"
      );
      const d = r * 0.707; // r * sin(45°)
      cross.setAttribute(
        "d", `M ${-d} ${-d} L ${d} ${d} M ${-d} ${d} L ${d} ${-d}`
      );
      cross.setAttribute("stroke",       stroke );
      cross.setAttribute("stroke-width", sw     );
      g.appendChild(cross);
    } else if (style === 'square' || style === 'diamond') {
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg", "rect"
      );
      rect.setAttribute("x", -r);      rect.setAttribute("y", -r);
      rect.setAttribute("width", r*2); rect.setAttribute("height", r*2);
      rect.setAttribute("fill", fill); rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", sw);
      if (style === 'diamond') rect.setAttribute("transform", "rotate(45)");
      g.appendChild(rect);
    }
    
    // Invisible hitbox
    if(isMainCanvas) {
      const hitbox = document.createElementNS(
        "http://www.w3.org/2000/svg", "circle"
      );
      hitbox.setAttribute("r",    Math.max(r, 12));
      hitbox.setAttribute("fill", "transparent");
      g.appendChild(hitbox);
    }
    
    targetSvg.appendChild(g);
  });

  //
  // 4. Text
  //
  state.labels.forEach(label => {
    const textNode = document.createElementNS(
      "http://www.w3.org/2000/svg", "text"
    );
    textNode.setAttribute("id", label.id);
    textNode.setAttribute("x",  label.x);
    textNode.setAttribute("y",  label.y);
    textNode.setAttribute("font-size",   24);
    textNode.setAttribute("font-family", "monospace");
    textNode.setAttribute("text-anchor", "middle");
    textNode.setAttribute("dominant-baseline", "central");
    textNode.setAttribute("class",       "diagram-object label");
    textNode.setAttribute("style",       "user-select: none;");
    textNode.textContent = label.text;

    if (state.selection.includes(label.id) && isMainCanvas) {
      textNode.classList.add("selected");
    }
    
    targetSvg.appendChild(textNode);
  });
  
  //
  // 5. Draw handles
  //
  if (state.selection.length === 1 && isMainCanvas) {
    const selectedId = state.selection[0];
    const selectedEdge  = state.edges.find(  e => e.id === selectedId );
    const selectedShape = state.shapes.find( s => s.id === selectedId );
    
    if (selectedEdge) {
      const A = { x: selectedEdge.x1, y: selectedEdge.y1 };
      const B = { x: selectedEdge.x2, y: selectedEdge.y2 };

      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const c = Math.sqrt(dx*dx + dy*dy);

      let M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };

    if( c < 0.1 ){
        const R = (
          selectedEdge.curvature === 0 || Math.abs(selectedEdge.curvature)<2) ?
            20 : Math.abs(selectedEdge.curvature
        );
        const angle = selectedEdge.tadpoleAngle !== undefined ?
                      selectedEdge.tadpoleAngle : -Math.PI/2;
        M = {
          x: A.x + 2 * R * Math.cos(angle),
          y: A.y + 2 * R * Math.sin(angle)
        }; 
        const C = {
          x: A.x + R * Math.cos(angle),
          y: A.y + R * Math.sin(angle)
        }; 
        drawHandle('handle-center', C.x, C.y, 'move', isShiftPress);
      } else if(c > 0 && selectedEdge.curvature !== 0) {
        const nx = -dy / c;
        const ny = dx / c;
        
        // M is the midpoint of the edge
        M.x += nx * selectedEdge.curvature;
        M.y += ny * selectedEdge.curvature;

        // C is the circle center
        const s = selectedEdge.curvature;
        const R = Math.abs(s / 2 + (c * c) / (8 * s));
        const h = s - R * Math.sign(s);
        
        const C = {
          x: (A.x + B.x) / 2 + nx * h,
          y: (A.y + B.y) / 2 + ny * h
        };
        
        drawHandle('handle-center', C.x, C.y, 'move', isShiftPress);
      }
      
      drawHandle('handle-start', A.x, A.y, 'move', isShiftPress);
      drawHandle('handle-end',   B.x, B.y, 'move', isShiftPress);
      drawHandle('handle-mid',   M.x, M.y, 'move', isShiftPress);
    } else if (selectedShape) {
      if (selectedShape.type === 'circle') {
        drawHandle(
          'handle-shapeCenter',
          selectedShape.x,
          selectedShape.y,
          'move'
        );
        const angle = selectedShape.handleAngle || 0; 
        const hx    = selectedShape.x + selectedShape.rx * Math.cos(angle);
        const hy    = selectedShape.y + selectedShape.rx * Math.sin(angle);
        drawHandle('handle-shapeRadius', hx, hy, 'crosshair');
      } else if (selectedShape.type === 'rect') {
        const cx = selectedShape.x + selectedShape.width  / 2;
        const cy = selectedShape.y + selectedShape.height / 2;
        
        drawHandle('handle-shapeCenter', cx, cy, 'move');
        drawHandle('handle-shapeTop',    cx, selectedShape.y, 'ns-resize');
        drawHandle('handle-shapeBottom',
          cx, selectedShape.y + selectedShape.height, 'ns-resize'
        );
        drawHandle('handle-shapeLeft',   selectedShape.x, cy, 'ew-resize');
        drawHandle('handle-shapeRight',
          selectedShape.x + selectedShape.width, cy,  'ew-resize'
        );
      }
    }
  }
}

/* ### Interface routines ################################################### */
/*
 *  When the user select an object, print its properties on the panel
 */
function updatePropertiesPanel() {
  // Selected object (if only one selected)
  let obj = null;

  if (state.selection.length === 1) {
    const id = state.selection[0];
    obj = state.edges.find(e => e.id === id) ||
          state.nodes.find(n => n.id === id) ||
          state.shapes.find(s => s.id === id);
  }

  const isNode  = (obj && obj.id.startsWith('node'))  ||
                    state.mode === 'point';
  const isEdge  = (obj && obj.id.startsWith('edge'))  ||
                    state.mode === 'line';
  const isShape = (obj && obj.id.startsWith('shape')) ||
                    state.mode === 'box' || state.mode === 'blob';
  
  // Selected object, if there is, has properties?
  const isActive = (state.mode !== 'select' && state.mode !== 'text') ||
                    obj !== null;

  inputs.forEach(input => {
    const hasNode  = input.classList.contains('node-prop');
    const hasLine  = input.classList.contains('line-prop');
    const hasShape = input.classList.contains('shape-prop');
    
    const shouldBeEnabled = isActive && (
      (hasNode && isNode) || 
      (hasLine && isEdge) || 
      (hasShape && isShape)
    );
    
    input.disabled = !shouldBeEnabled;
  });

  // Update properties only if obj has been clicked and it is active
  if (obj && isActive) {
    inColor.value = obj.color       || defaultColor;
    inWidth.value = obj.strokeWidth || defaultWidth;

    if (isNode) {
      inNodeStyle.value  = obj.nodeStyle || defaultNodeStyle;
      inNodeRadius.value = obj.radius    || defaultNodeRadius;
    }
    
    if (isNode || isShape) {
      inFillType.value   = obj.fillType   || defaultFillType;
      inFillColor.value  = obj.fillColor  || defaultFillColor;
      inPatAngle.value   = obj.patAngle   || defaultPatAngle;
      inPatColor.value   = obj.patColor   || defaultPatColor;
      inPatWidth.value   = obj.patWidth   || defaultPatWidth;
      inPatSpacing.value = obj.patSpacing || defaultPatSpacing;
    }

    if (isEdge) {
      inLineType.value     = obj.lineType     || defaultLineType;
      inDashLength.value   = obj.dashLength   || defaultDashLength;
      inMultiplicity.value = obj.multiplicity || defaultMultiplicity;
      inArrowSize.value    = obj.arrowSize    || defaultArrowSize;
      inArrowStart.checked = obj.arrowStart   || defaultArrowStart;
      inArrowMid.checked   = obj.arrowMid     || defaultArrowMid;
      inArrowEnd.checked   = obj.arrowEnd     || defaultArrowEnd;
      inArrowFlip.checked  = obj.arrowFlip    || defaultArrowFlip;
    }
  }
}

/*
 *  Set the operating mode (select mode, insert a vertex, ...)
 */
function setMode(newMode) {
  if (state.mode === 'select' && newMode !== 'select') {
    state.selection = [];
    render();
  }

  state.mode = newMode;

  // set active mode
  document.querySelectorAll('#tools .button').forEach(
    btn => btn.classList.remove('primary')
  );
  const activeBtn = document.getElementById('btn-' + newMode);
  if (activeBtn) activeBtn.classList.add('primary');
 
  updatePropertiesPanel();
}

function updateSnapping(value) {
  state.gridSize = parseInt(value, 10);
}

// Helper function for snapping
function getMouseCoords(e) {
  const rect = svg.getBoundingClientRect();
  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;
  
  const snapThreshold = 10**2;

  let xg = x;
  let yg = y;
  let d2 = +Infinity;
  
  if (state.gridSize > 0) {
    xg = Math.round(x / state.gridSize) * state.gridSize;
    yg = Math.round(y / state.gridSize) * state.gridSize;
    d2 = (x-xg)**2 + (y-yg)**2;
  }
  // Snap to points
  for(let node of state.nodes) {
    if ( (x-node.x)**2 + (y-node.y)**2 < d2 ) {
      d2 = (x-node.x)**2 + (y-node.y)**2;
      xg = node.x;  yg = node.y;
    }
  }
  // Snap to lines endpoints
  for(let edge of state.edges) {
    let distStart = (x-edge.x1)**2 + (y-edge.y1)**2;
    if ( distStart < d2 ) {
      d2 = distStart;
      xg = edge.x1; yg = edge.y1;
    }
    
    let distEnd = (x-edge.x2)**2 + (y-edge.y2)**2;
    if ( distEnd < d2 ) {
      d2 = distEnd;
      xg = edge.x2; yg = edge.y2;
    }
  }
  // Snap to blobs and boxes
  for (let shape of state.shapes) {
    if (shape.type === 'circle') {
      const cx = shape.x;
      const cy = shape.y;
      const r = shape.rx;
      
      const vx = x - cx;
      const vy = y - cy;
      const dist = Math.sqrt(vx*vx + vy*vy);
      
      if (dist > 0) {
        const px = cx + (vx / dist) * r;
        const py = cy + (vy / dist) * r;
        const distToBorder = (x - px)**2 + (y - py)**2;
        
        if (distToBorder < d2) {
          d2 = distToBorder;
          xg = px; yg = py;
        }
      }
    } else if (shape.type === 'rect') {
      const rx = shape.x, ry = shape.y, rw = shape.width, rh = shape.height;

      let px = Math.max(rx, Math.min(x, rx + rw));
      let py = Math.max(ry, Math.min(y, ry + rh));
      
      if (px === x && py === y) {
        const distLeft   = x - rx;
        const distRight  = (rx + rw) - x;
        const distTop    = y - ry;
        const distBottom = (ry + rh) - y;
        
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
        
        if (minDist === distLeft)       px = rx;
        else if (minDist === distRight) px = rx + rw;
        else if (minDist === distTop)   py = ry;
        else                            py = ry + rh;
      }
      
      const distToBorder = (x - px)**2 + (y - py)**2;
      if (distToBorder < d2) {
        d2 = distToBorder;
        xg = px; yg = py;
      }
    }
  }
  if ( state.gridSize == 0 && d2 > snapThreshold ) {
    xg = x;
    yg = y;
  }

  return { x: xg, y: yg };
}

/* ### |- Undo/Redo routines ################################################ */
function saveHistory() {
  // Save a deep copy before each change
  const currentState = {
    nodes:  JSON.parse(JSON.stringify(state.nodes)),
    edges:  JSON.parse(JSON.stringify(state.edges)),
    labels: JSON.parse(JSON.stringify(state.labels)),
    shapes: JSON.parse(JSON.stringify(state.shapes)),
  };
  state.history.push(currentState);
  state.redoStack = []; // Empty redo stack after a new action
}

function undo() {
  if (state.history.length === 0) return;
  
  // Save actual state
  const currentState = {
    nodes:  JSON.parse(JSON.stringify(state.nodes)),
    edges:  JSON.parse(JSON.stringify(state.edges)),
    labels: JSON.parse(JSON.stringify(state.labels)),
    shapes: JSON.parse(JSON.stringify(state.shapes))
  };
  state.redoStack.push(currentState);
  
  // Recover
  const previousState = state.history.pop();
  state.nodes  = previousState.nodes;
  state.edges  = previousState.edges;
  state.labels = previousState.labels;
  state.shapes = previousState.shapes;
  
  // Remove selection from deleted objects
  state.selection = state.selection.filter(id => 
    state.nodes.some( n => n.id === id) || 
    state.edges.some( e => e.id === id) || 
    state.labels.some(l => l.id === id) ||
    state.shapes.some(s => s.id === id)
  );
  
  render();
}

function redo() {
  if (state.redoStack.length === 0) return;
  
  const currentState = {
    nodes:  JSON.parse(JSON.stringify(state.nodes)),
    edges:  JSON.parse(JSON.stringify(state.edges)),
    labels: JSON.parse(JSON.stringify(state.labels)),
    shapes: JSON.parse(JSON.stringify(state.shapes)),
  };
  state.history.push(currentState);
  
  const nextState = state.redoStack.pop();
  state.nodes  = nextState.nodes;
  state.edges  = nextState.edges;
  state.labels = nextState.labels;
  state.shapes = nextState.shapes;
  render();
}

/* ### |- Objects generators ################################################ */
function addPoint (x, y) {
  saveHistory();
  state.nodes.push({ 
    id: 'node_' + Date.now(), 
    x: x, 
    y: y,
    radius:      parseFloat(inNodeRadius.value) || defaultNodeRadius,
    color:                  inColor.value       || defaultColor,
    strokeWidth: parseFloat(inWidth.value)      || defaultWidth,
    fillColor:              inFillColor.value   || defaultFillColor,
    fillType:               inFillType.value    || defaultFillType,
    nodeStyle:              inNodeStyle.value   || defaultNodeStyle,
    patAngle:    parseFloat(inPatAngle.value)   || defaultPatAngle,
    patColor:               inPatColor.value    || defaultPatColor,
    patWidth:    parseFloat(inPatWidth.value)   || defaultPatWidth,
    patSpacing:  parseFloat(inPatSpacing.value) || defaultPatSpacing
  });
  render();
}

function addLine  (x, y) {
  if (!isDrawingLine) {
    isDrawingLine = true;
    lineStartCoords = { x, y };
  } else {
    saveHistory();
    const id = 'edge_' + Date.now();
    state.edges.push({
      id: id,
      x1: lineStartCoords.x,
      y1: lineStartCoords.y,
      x2: x,
      y2: y,
      curvature: 0,
      color:                    inColor.value          || defaultColor,
      strokeWidth: parseFloat ( inWidth.value )        || defaultWidth,
      lineType:                 inLineType.value       || defaultLineType,
      multiplicity: parseInt  ( inMultiplicity.value ) || defaultMultiplicity,
      dashLength:   parseFloat( inDashLength.value )   || defaultDashLength,
      arrowMid:                 inArrowMid.checked     || defaultArrowMid,
      arrowEnd:                 inArrowEnd.checked     || defaultArrowEnd,
      arrowStart:               inArrowStart.checked   || defaultArrowStart,
      arrowSize:    parseFloat( inArrowSize.value )    || defaultArrowSize,
      arrowFlip:                inArrowFlip.checked    || defaultArrowFlip,
    });
    isDrawingLine   = false;
    lineStartCoords = null;
    previewLine.style.display = "none";
    render();
  }
}

function addBlob  (x, y) {
  saveHistory();
  state.shapes.push({
    id: 'shape_' + Date.now(),
    type: 'circle',
    x: x,
    y: y,
    rx: 30, 
    ry: 30,
    color:                   inColor.value        || defaultColor,
    strokeWidth: parseFloat( inWidth.value )      || defaultWidth,
    fillColor:               inFillColor.value    || defaultFillColor,
    fillType:                inFillType.value     || defaultFillType,
    patAngle: parseFloat(    inPatAngle.value )   || defaultPatAngle,
    patColor:                inPatColor.value     || defaultPatColor,
    patWidth: parseFloat(    inPatWidth.value )   || defaultPatWidth,
    patSpacing: parseFloat(  inPatSpacing.value ) || defaultPatSpacing
  });
  render();
}

function addBox   (x, y) {
  saveHistory();
  state.shapes.push({
    id: 'shape_' + Date.now(),
    type: 'rect',
    x: x - 30,
    y: y - 30,
    width:  60,
    height: 60,
    color:                  inColor.value       || defaultColor,
    strokeWidth: parseFloat(inWidth.value)      || defaultWidth,
    fillColor:              inFillColor.value   || defaultFillColor,
    fillType:               inFillType.value    || defaultFillType,
    patAngle: parseFloat(   inPatAngle.value)   || defaultPatAngle,
    patColor:               inPatColor.value    || defaultPatColor,
    patWidth: parseFloat(   inPatWidth.value)   || defaultPatWidth,
    patSpacing: parseFloat( inPatSpacing.value) || defaultPatSpacing
  });
  render();
}

function addLabel (x, y) {
  const text = prompt("Insert label text:", ""); 
  
  if (text === null || text.trim() === "") return; // Undo if empty string

  saveHistory();
  const id = 'label_' + Date.now();
  state.labels.push({
    id:   id,
    text: text,
    x:    x,
    y:    y,
    fontSize: 24
  });
  
  render();
}

/* ### |- Listeners ######################################################### */
svg.addEventListener('click', (e) => {
  const coords = getMouseCoords(e);
  
  // Do not select if just created an object
  if (objectClickedInMousedown && state.mode !== 'line') return;

  switch(state.mode) {
    case 'point':
      addPoint( coords.x, coords.y );
      break;
    case 'line':
      addLine(  coords.x, coords.y );
      break;
    case 'text':
      addLabel( coords.x, coords.y );
      break;
    case 'blob':
      addBlob(  coords.x, coords.y );
      break;
    case 'box':
      addBox(   coords.x, coords.y );
      break;
  }
});

propPanel.addEventListener('input', (e) => {
  if (state.selection.length === 1) {
    const id  = state.selection[0];
    const obj = state.edges.find( e => e.id === id) ||
                state.nodes.find( n => n.id === id) ||
                state.shapes.find(s => s.id === id);
    
    if (obj) {
      if (e.type === 'change') saveHistory(); 
      
      obj.color       = inColor.value                    || defaultColor;
      obj.strokeWidth = parseFloat(inWidth.value)        || defaultWidth;

      if (obj.id.startsWith('node')) {
        obj.nodeStyle = inNodeStyle.value                || defaultNodeStyle;
        obj.radius    = parseFloat(inNodeRadius.value)   || defaultNodeRadius;
      }
      
      if (obj.id.startsWith('node') || obj.id.startsWith('shape')) {
        obj.fillType   = inFillType.value                || defaultFillType;
        obj.fillColor  = inFillColor.value               || defaultFillColor;
        obj.patAngle   = parseFloat(inPatAngle.value)    || defaultPatAngle;
        obj.patColor   = inPatColor.value                || defaultPatColor;
        obj.patWidth   = parseFloat(inPatWidth.value)    || defaultPatWidth;
        obj.patSpacing = parseFloat(inPatSpacing.value)  || defaultPatSpacing;
      }

      if (obj.id.startsWith('edge')) {
        obj.lineType     = inLineType.value              || defaultLineType;
        obj.dashLength   = parseFloat(inDashLength.value)|| defaultDashLength;
        obj.multiplicity = parseInt(inMultiplicity.value)|| defaultMultiplicity;
        obj.arrowSize    = parseFloat(inArrowSize.value) || defaultArrowSize;
        obj.arrowStart   = inArrowStart.checked          || defaultArrowStart;
        obj.arrowMid     = inArrowMid.checked            || defaultArrowMid;
        obj.arrowEnd     = inArrowEnd.checked            || defaultArrowEnd;
        obj.arrowFlip    = inArrowFlip.checked           || defaultArrowFlip;
      }
      render();
    }
  }
});

svg.addEventListener('mouseleave', hidePreviews);

svg.addEventListener('mousemove', (e) => {
  const coords = getMouseCoords(e);
  currentMousePos = coords;
  
  if (isPasting) {
    const dx = coords.x - lastMouseCoords.x;
    const dy = coords.y - lastMouseCoords.y;
    
    if (dx !== 0 || dy !== 0) {
      state.selection.forEach(id => {
        let node = state.nodes.find(n => n.id === id);
        if (node) { node.x += dx; node.y += dy; }
        
        let shape = state.shapes.find(s => s.id === id);
        if (shape) { shape.x += dx; shape.y += dy; }
        
        let label = state.labels.find(l => l.id === id);
        if (label) { label.x += dx; label.y += dy; }
        
        let edge = state.edges.find(ed => ed.id === id);
        if (edge) { 
          edge.x1 += dx; edge.y1 += dy;
          edge.x2 += dx; edge.y2 += dy;
        }
      });
      lastMouseCoords = coords;
      render();
    }
    return;
  }

  hidePreviews(); // Hide previous previews
  if (state.mode === 'point') {
    const r        = parseFloat(inNodeRadius.value) || defaultNodeRadius;
    const stroke   =            inColor.value       || defaultColor;
    const sw       = parseFloat(inWidth.value)      || defaultWidth;
    const fillType =            inFillType.value    || defaultFillType;
    const fill     = fillType === 'solid' ?
      (inFillColor.value || defaultFillColor) : 'transparent';
    
    previewPoint.setAttribute("cx",           coords.x);
    previewPoint.setAttribute("cy",           coords.y);
    previewPoint.setAttribute("r",            r);
    previewPoint.setAttribute("stroke",       stroke);
    previewPoint.setAttribute("stroke-width", sw);
    previewPoint.setAttribute("fill",         fill);
    previewPoint.style.display = "block";
  } else if (state.mode === 'line' && isDrawingLine) {
    const stroke   =            inColor.value    || defaultColor;
    const sw       = parseFloat(inWidth.value)   || defaultWidth;
    const lineType =            inLineType.value || defaultLineType;
    
    previewLine.setAttribute("d",
      `M ${lineStartCoords.x} ${lineStartCoords.y} L ${coords.x} ${coords.y}`
    );
    previewLine.setAttribute("stroke",       stroke);
    previewLine.setAttribute("stroke-width", sw);
    
    if (lineType === 'dashed') {
      const dL = parseFloat(inDashLength.value) || defaultDashLength;
      previewLine.setAttribute("stroke-dasharray", `${dL},${dL}`);
    } else {
      previewLine.removeAttribute("stroke-dasharray");
    }
    previewLine.style.display = "block";

  } else if (state.mode === 'blob') {
    const stroke   =            inColor.value    || defaultColor;
    const sw       = parseFloat(inWidth.value)   || defaultWidth;
    const fillType =            inFillType.value || defaultFillType;
    const fill     = fillType === 'solid' ?
      (inFillColor.value || defaultFillColor) :
      'transparent';

    previewBlob.setAttribute("cx", coords.x);
    previewBlob.setAttribute("cy", coords.y);
    previewBlob.setAttribute("rx", 30);
    previewBlob.setAttribute("ry", 30);
    previewBlob.setAttribute("stroke", stroke);
    previewBlob.setAttribute("stroke-width", sw);
    previewBlob.setAttribute("fill", fill);
    previewBlob.style.display = "block";

  } else if (state.mode === 'box') {
    const stroke   =            inColor.value    || defaultColor;
    const sw       = parseFloat(inWidth.value)   || defaultWidth;
    const fillType =            inFillType.value || defaultFillType;
    const fill = fillType === 'solid' ?
      (inFillColor.value || defaultFillColor) : 'transparent';

    previewBox.setAttribute("x", coords.x - 30);
    previewBox.setAttribute("y", coords.y - 30);
    previewBox.setAttribute("width", 60);
    previewBox.setAttribute("height", 60);
    previewBox.setAttribute("stroke", stroke);
    previewBox.setAttribute("stroke-width", sw);
    previewBox.setAttribute("fill", fill);
    previewBox.style.display = "block";

  } else {
    if (isDragging) {
      hasDragged = true;

      if (dragTarget.type === 'multi-drag') {
        const dx = coords.x - lastMouseCoords.x;
        const dy = coords.y - lastMouseCoords.y;
        
        if (dx !== 0 || dy !== 0) {
          state.selection.forEach(id => {
            let node = state.nodes.find(n => n.id === id);
            if (node) { node.x += dx; node.y += dy; }
            
            let shape = state.shapes.find(s => s.id === id);
            if (shape) { shape.x += dx; shape.y += dy; }
            
            let label = state.labels.find(l => l.id === id);
            if (label) { label.x += dx; label.y += dy; }
            
            let edge = state.edges.find(ed => ed.id === id);
            if (edge) { 
              edge.x1 += dx; edge.y1 += dy;
              edge.x2 += dx; edge.y2 += dy;
            }
          });
          lastMouseCoords = coords;
        }
      }
      else if (dragTarget.type === 'select-box') {
        const x = Math.min(coords.x, dragTarget.startX);
        const y = Math.min(coords.y, dragTarget.startY);
        const w = Math.abs(coords.x - dragTarget.startX);
        const h = Math.abs(coords.y - dragTarget.startY);
        selectionBox.setAttribute("x", x);
        selectionBox.setAttribute("y", y);
        selectionBox.setAttribute("width", w);
        selectionBox.setAttribute("height", h);
        selectionBox.style.display = "block";
      }
      else if (dragTarget.type === 'shape-handle') {
        const shape = state.shapes.find(s => s.id === dragTarget.shapeId);
        if (shape) {
          if (dragTarget.handleType === 'shapeCenter') {
            if (shape.type === 'circle') {
              shape.x = coords.x; shape.y = coords.y;
            } else {
              shape.x = coords.x - shape.width / 2; shape.y =
                coords.y - shape.height / 2;
            }
          } else if (dragTarget.handleType === 'shapeRadius') {
            const dx = coords.x - shape.x;
            const dy = coords.y - shape.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            shape.rx = dist;
            shape.ry = dist;
            shape.handleAngle = Math.atan2(dy, dx);
          } else if (dragTarget.handleType === 'shapeTop') {
            const bottom = shape.y + shape.height;
            // Minimum size constraints
            if (coords.y < bottom - 1) {
              shape.y = coords.y;
              shape.height = bottom - coords.y;
            }
          } else if (dragTarget.handleType === 'shapeBottom') {
            // Minimum size constraints
            if (coords.y > shape.y + 1) {
              shape.height = coords.y - shape.y;
            }
          } else if (dragTarget.handleType === 'shapeLeft') {
            const right = shape.x + shape.width;
            // Minimum size constraints
            if (coords.x < right - 1) {
              shape.x = coords.x;
              shape.width = right - coords.x;
            }
          } else if (dragTarget.handleType === 'shapeRight') {
            // Minimum size constraints
            if (coords.x > shape.x + 1) {
              shape.width = coords.x - shape.x;
            }
          }
        }
      } else if (dragTarget.type === 'handle') {
        const edge = state.edges.find(ed => ed.id === dragTarget.edgeId);
        const init = dragTarget.initial;

        if (
          init.c < 0.1 &&
          (
            dragTarget.handleType === 'center' ||
            dragTarget.handleType === 'mid'
          )
        ) {
          const vx  = coords.x - edge.x1;
          const vy  = coords.y - edge.y1;
          let dist  = Math.sqrt(vx*vx + vy*vy);
          let angle = Math.atan2(vy, vx);
          
          if (dragTarget.handleType === 'mid') dist = dist / 2;
          
          if (e.shiftKey) {
            // with shift
            edge.tadpoleAngle = angle;
          } else {
            // without shift
            edge.tadpoleAngle = angle;
            if (dist < 2) dist = 20; 
            edge.curvature = dist;
          }
        } 
        // Shift pressed
        else if (e.shiftKey && Math.abs(init.curvature) > 0.1) {
          if (
            dragTarget.handleType === 'center' ||
            dragTarget.handleType === 'mid'
          ) {
            const fixedX = init.x1;
            const fixedY = init.y1;
            const movingX = init.x2;
            const movingY = init.y2;
            
            const oldRefX = dragTarget.handleType === 'center' ?
              init.cx : init.mx;
            const oldRefY = dragTarget.handleType === 'center' ?
              init.cy : init.my;

            const oldDx = oldRefX  - fixedX;
            const oldDy = oldRefY  - fixedY;
            const newDx = coords.x - fixedX;
            const newDy = coords.y - fixedY;

            const oldDist = Math.sqrt(oldDx*oldDx + oldDy*oldDy);
            const newDist = Math.sqrt(newDx*newDx + newDy*newDy);

            if (oldDist > 0) {
              const scale = newDist / oldDist;
              const dAngle = Math.atan2(newDy,newDx) - Math.atan2(oldDy,oldDx);

              const bxDx = movingX - fixedX;
              const bxDy = movingY - fixedY;
              
              const rotX = bxDx * Math.cos(dAngle) - bxDy * Math.sin(dAngle);
              const rotY = bxDx * Math.sin(dAngle) + bxDy * Math.cos(dAngle);

              edge.x2 = fixedX + rotX * scale;
              edge.y2 = fixedY + rotY * scale;

              edge.curvature = init.curvature * scale;
            }
          } else if (
            dragTarget.handleType === 'start' ||
            dragTarget.handleType === 'end'
          ) {
            const C = { x: init.cx, y: init.cy };
            
            const vx = coords.x - C.x;
            const vy = coords.y - C.y;
            const dist = Math.sqrt(vx*vx + vy*vy);
            
            if (dist > 0) {
              const newPtX = C.x + init.R * (vx / dist);
              const newPtY = C.y + init.R * (vy / dist);
              
              if (dragTarget.handleType === 'start') {
                edge.x1 = newPtX; edge.y1 = newPtY;
              } else {
                edge.x2 = newPtX; edge.y2 = newPtY;
              }
              
              const cDx = edge.x2 - edge.x1;
              const cDy = edge.y2 - edge.y1;
              const chord = Math.sqrt(cDx*cDx + cDy*cDy);
              
              if (chord > 0) {
                const midX = (edge.x1 + edge.x2) / 2;
                const midY = (edge.y1 + edge.y2) / 2;
                const normX = -cDy / chord;
                const normY = cDx / chord;
                const h = (C.x - midX) * normX + (C.y - midY) * normY;
                
                edge.curvature = h + init.R * Math.sign(init.curvature);
              }
            }
          }
        }
        // Shift and Straight line
        else if (
          e.shiftKey && init.curvature === 0 &&
          (
            dragTarget.handleType === 'start' ||
            dragTarget.handleType === 'end'
          )
        ) {
          const dx = init.x2 - init.x1;
          const dy = init.y2 - init.y1;
          const len = Math.sqrt(dx*dx + dy*dy);
          
          if (len > 0) {
            const nx = dx / len;
            const ny = dy / len;
            
            const projLen = (coords.x - init.x1) * nx +
                            (coords.y - init.y1) * ny;
            const px = init.x1 + projLen * nx;
            const py = init.y1 + projLen * ny;
            
            if (dragTarget.handleType === 'start') {
              edge.x1 = px; edge.y1 = py;
            } else {
              edge.x2 = px; edge.y2 = py;
            }
          }
        }
        // without shift
        else {
          if (dragTarget.handleType === 'start') {
            edge.x1 = coords.x; edge.y1 = coords.y;
          } else if (dragTarget.handleType === 'end') {
            edge.x2 = coords.x; edge.y2 = coords.y;
          } else if (dragTarget.handleType === 'mid') {
            const dx = edge.x2 - edge.x1;
            const dy = edge.y2 - edge.y1;
            const c = Math.sqrt(dx*dx + dy*dy);
            if (c > 0) {
              const nx = -dy / c;
              const ny = dx / c;
              const midX = (edge.x1 + edge.x2) / 2;
              const midY = (edge.y1 + edge.y2) / 2;
              const vx = coords.x - midX;
              const vy = coords.y - midY;
              edge.curvature = vx * nx + vy * ny;
            }
          } else if (dragTarget.handleType === 'center') {
            const dx = edge.x2 - edge.x1;
            const dy = edge.y2 - edge.y1;
            const c = Math.sqrt(dx*dx + dy*dy);
            if (c > 0) {
              const nx = -dy / c;
              const ny = dx / c;
              const midX = (edge.x1 + edge.x2) / 2;
              const midY = (edge.y1 + edge.y2) / 2;
              const vx = coords.x - midX;
              const vy = coords.y - midY;
              const h = vx * nx + vy * ny;
              const R = Math.sqrt((c / 2)**2 + h**2);
              edge.curvature = edge.curvature >= 0 ? h + R : h - R;
            }
          }
        }
      }
      render(e.shiftKey);
    }
  }
});

svg.addEventListener('mousedown', (e) => {
  hasDragged = false;
  objectClickedInMousedown = false;

  if (isPasting) {
    isPasting = false;
    return; // Ferma il mousedown qui
  }

  const target = e.target.closest('.diagram-object') || e.target;
  let targetId = target.id;
  if (targetId && targetId.startsWith('hit_')) targetId = targetId.substring(4);

if (
    state.mode === 'select' && (
      targetId === 'feynman-canvas' ||
      targetId === 'grid-background'
    )
  ) {
    isDragging = true;
    const coords = getMouseCoords(e);
    dragTarget = { type: 'select-box', startX: coords.x, startY: coords.y };
    
    if (!e.shiftKey) {
      state.selection = [];
      render();
    }
    return;
  }

  if (
    state.mode === 'select' &&
    target.classList &&
    target.classList.contains('diagram-object') &&
    !target.classList.contains('handle')
  ) {
    objectClickedInMousedown = true;
    
    if (!state.selection.includes(targetId)) {
      if (!e.shiftKey) state.selection = [targetId];
      else state.selection.push(targetId);
      render();
    } else if (e.shiftKey) {
      // De-select with shift
      const index = state.selection.indexOf(targetId);
      state.selection.splice(index, 1);
      render();
      return; 
    }
    
    if (
      state.mode === 'select' || state.mode === 'point' ||
      state.mode === 'blob' || state.mode === 'box' || state.mode === 'text'
    ) {
      isDragging = true;
      dragTarget = { type: 'multi-drag', id: targetId };
      lastMouseCoords = getMouseCoords(e);
      saveHistory();
      return;
    }
  }

  if (
    state.mode === 'select' && target.classList &&
    target.classList.contains('handle')
  ) {
    isDragging = true;
    objectClickedInMousedown = true;
    const part = target.id.split('-');
    const handleName = part[1];
    dragTarget = null;

    if (handleName.startsWith('shape')) {
      dragTarget = {
        type: 'shape-handle',
        shapeId: state.selection[0], 
        handleType: handleName
      };
      saveHistory();
    } else {
      dragTarget = {
        type: 'handle',
        edgeId: state.selection[0],
        handleType: part[1]
      };
      const edge = state.edges.find(ed => ed.id === dragTarget.edgeId);
      const dx = edge.x2 - edge.x1;
      const dy = edge.y2 - edge.y1;
      const c = Math.sqrt(dx*dx + dy*dy);
      
      let cx = 0, cy = 0, R = 0,
          mx = (edge.x1 + edge.x2)/2,
          my = (edge.y1 + edge.y2)/2;
      
      if (c < 0.1) {
        R = (edge.curvature === 0 || Math.abs(edge.curvature) < 2) ?
            20 :
            Math.abs(edge.curvature);
        const angle = edge.tadpoleAngle !== undefined ?
                      edge.tadpoleAngle : -Math.PI/2;
        cx = edge.x1 + R * Math.cos(angle);
        cy = edge.y1 + R * Math.sin(angle);
        mx = edge.x1 + 2 * R * Math.cos(angle);
        my = edge.y1 + 2 * R * Math.sin(angle);
      } else if (edge.curvature !== 0) {
        const s = edge.curvature;
        R = Math.abs(s / 2 + (c * c) / (8 * s));
        const nx = -dy / c;
        const ny = dx / c;
        const h = s - R * Math.sign(s);
        cx = (edge.x1 + edge.x2) / 2 + nx * h;
        cy = (edge.y1 + edge.y2) / 2 + ny * h;
        mx += nx * s;
        my += ny * s;
      }

      dragTarget.initial = {
        x1: edge.x1, y1: edge.y1,
        x2: edge.x2, y2: edge.y2,
        curvature: c < 0.1 ? R : edge.curvature,
        c: c,
        cx: cx,
        cy: cy,
        R: R,
        mx: mx,
        my: my
      };
      saveHistory();
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (isDragging && dragTarget && dragTarget.type === 'select-box') {
    const bx1 = parseFloat(selectionBox.getAttribute("x"));
    const by1 = parseFloat(selectionBox.getAttribute("y"));
    const bx2 = bx1 + parseFloat(selectionBox.getAttribute("width"));
    const by2 = by1 + parseFloat(selectionBox.getAttribute("height"));

    let newSelection = [];
    const inBox = (x, y) => x >= bx1 && x <= bx2 && y >= by1 && y <= by2;

    state.nodes.forEach(n => { if(inBox(n.x, n.y)) newSelection.push(n.id); });
    state.labels.forEach(l => { if(inBox(l.x, l.y)) newSelection.push(l.id); });
    state.shapes.forEach(s => {
      let cx = s.type === 'rect' ? s.x + s.width/2 : s.x;
      let cy = s.type === 'rect' ? s.y + s.height/2 : s.y;
      if(inBox(cx, cy)) newSelection.push(s.id);
    });
    state.edges.forEach(edge => {
      if(inBox(edge.x1, edge.y1) && inBox(edge.x2, edge.y2))
        newSelection.push(edge.id);
    });

    if (e.shiftKey) {
      newSelection.forEach(id => {
        if(!state.selection.includes(id)) state.selection.push(id);
      });
    } else {
      state.selection = newSelection;
    }
    
    selectionBox.style.display = "none";
    render();
  }

  if (!hasDragged && dragTarget && dragTarget.type === 'multi-drag') {
    const id = dragTarget.id;
    
    const label = state.labels.find(l => l.id === id);
    if (label) {
      const newText = prompt("New label:", label.text);
      if (newText !== null && newText.trim() !== "") {
        saveHistory();
        label.text = newText;
        render();
      } else {
        alert("Insert a non-empty string or delete the label.");
      }
    }
  }

  isDragging = false;
  dragTarget = null;
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
   
    // Ctrl+A: Select All
    if (key === 'a') {
      e.preventDefault();
      
      // Svuota la selezione attuale e la riempie con tutti gli ID
      state.selection = [];
      state.nodes.forEach(n => state.selection.push(n.id));
      state.edges.forEach(ed => state.selection.push(ed.id));
      state.shapes.forEach(s => state.selection.push(s.id));
      state.labels.forEach(l => state.selection.push(l.id));
      
      render();
      return;
    }

    // Ctrl+S: Save JSON
    if (key === 's') {
      e.preventDefault();
      saveDiagram();
      return;
    }
    
    // Ctrl+O: Open/Load JSON
    if (key === 'o') {
      e.preventDefault();
      loadDiagram();
      return;
    }

    // Ctrl+C or X: Copy or cut
    if (key === 'c' || key === 'x') {
      if (state.selection.length === 0) return;
      
      clipboard = { nodes: [], edges: [], shapes: [], labels: [] };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      const updateBounds = (x, y) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      };

      state.selection.forEach(id => {
        let n = state.nodes.find(o => o.id === id);
        if (n) {
          clipboard.nodes.push(JSON.parse(JSON.stringify(n)));
          updateBounds(n.x, n.y);
        }
        let s = state.shapes.find(o => o.id === id);
        if (s) {
          clipboard.shapes.push(JSON.parse(JSON.stringify(s)));
          updateBounds(s.x, s.y);
        }
        let l = state.labels.find(o => o.id === id);
        if (l) {
          clipboard.labels.push(JSON.parse(JSON.stringify(l)));
          updateBounds(l.x, l.y);
        }
        let ed = state.edges.find(o => o.id === id);
        if (ed) {
          clipboard.edges.push(JSON.parse(JSON.stringify(ed)));
          updateBounds(ed.x1, ed.y1); updateBounds(ed.x2, ed.y2);
        }
      });
      clipboard.centerX = (minX + maxX) / 2;
      clipboard.centerY = (minY + maxY) / 2;

      if (key === 'x') {
        saveHistory();
        state.nodes = state.nodes.filter(  n=>!state.selection.includes(n.id));
        state.edges = state.edges.filter( ed=>!state.selection.includes(ed.id));
        state.shapes = state.shapes.filter(s=>!state.selection.includes(s.id));
        state.labels = state.labels.filter(l=>!state.selection.includes(l.id));
        state.selection = [];
        render();
      }
      return;
    }

    // Ctrl+V: Paste
    if (key === 'v') {
      e.preventDefault();

      if (!clipboard) return;
      saveHistory();

      const dx = currentMousePos.x - clipboard.centerX;
      const dy = currentMousePos.y - clipboard.centerY;
      const newSelection = [];
      const now = Date.now();
      let counter = 0;
      const genId = (prefix) => `${prefix}_${now}_${counter++}`;

      clipboard.nodes.forEach(n => {
        const cl = { ...n, id: genId('node'), x: n.x + dx, y: n.y + dy };
        state.nodes.push(cl); newSelection.push(cl.id);
      });
      clipboard.shapes.forEach(s => {
        const cl = { ...s, id: genId('shape'), x: s.x + dx, y: s.y + dy };
        state.shapes.push(cl); newSelection.push(cl.id);
      });
      clipboard.labels.forEach(l => {
        const cl = { ...l, id: genId('label'), x: l.x + dx, y: l.y + dy };
        state.labels.push(cl); newSelection.push(cl.id);
      });
      clipboard.edges.forEach(ed => {
        const cl = { ...ed, id: genId('edge'), x1: ed.x1 + dx, y1: ed.y1 + dy, x2: ed.x2 + dx, y2: ed.y2 + dy };
        state.edges.push(cl); newSelection.push(cl.id);
      });

      state.selection = newSelection;
      isPasting = true;
      lastMouseCoords = { x: currentMousePos.x, y: currentMousePos.y };
      render();
      return;
    }
  }

  switch (e.key.toLowerCase()) {
    case 'escape':
      setMode('select');
      isDrawingLine = false;
      previewLine.style.display = "none";
      break;
    case 'delete':
    case 'backspace':
      if (state.selection.length > 0) {
        saveHistory();
        state.nodes = state.nodes.filter(n => !state.selection.includes(n.id));
        state.edges = state.edges.filter(e => !state.selection.includes(e.id));
        state.shapes = state.shapes.filter(s => !state.selection.includes(s.id));
        state.labels = state.labels.filter(l => !state.selection.includes(l.id));
        state.selection = [];
        render();
      }
      break;
    case 'p':
      setMode('point');
      break;
    case 'l':
      setMode('line');
      break;
    case 't':
      setMode('text');
      break;
    case 'b':
      setMode('blob');
      break;
    case 'r':
      setMode('box');
      break;
  }

  render(e.shiftKey);
});

window.addEventListener('keyup', (e) => {
  render(e.shiftKey);
})

/* ### `- Setup routines #################################################### */
function initGrid() {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  
  // Pattern 1: Dashed grid
  const fineGrid = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  fineGrid.setAttribute("id", "fine-grid");
  fineGrid.setAttribute("width", "10");
  fineGrid.setAttribute("height", "10");
  fineGrid.setAttribute("patternUnits", "userSpaceOnUse");
  fineGrid.innerHTML = '<path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0, 0, 0, 0.15)" stroke-width="0.5" stroke-dasharray="2,2"/>';
  
  // Pattern 2: Solid grid
  const coarseGrid = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  coarseGrid.setAttribute("id", "coarse-grid");
  coarseGrid.setAttribute("width", "40");
  coarseGrid.setAttribute("height", "40");
  coarseGrid.setAttribute("patternUnits", "userSpaceOnUse");
  // Il pattern largo disegna se stesso, ma riempie lo sfondo con il pattern fine
  coarseGrid.innerHTML = '<rect width="40" height="40" fill="url(#fine-grid)"/>' +
                         '<path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 0, 0, 0.3)" stroke-width="1"/>';
  
  defs.appendChild(fineGrid);
  defs.appendChild(coarseGrid);
  svg.appendChild(defs);
  
  // Rettangolo grande quanto tutto il canvas che fa da "foglio a quadretti"
  const gridRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  gridRect.id = "grid-background";
  gridRect.setAttribute("width", "100%");
  gridRect.setAttribute("height", "100%");
  gridRect.setAttribute("fill", "url(#coarse-grid)");
  gridRect.setAttribute("style", "pointer-events: none;"); // Fondamentale: ignora i click per non disturbare gli oggetti
  
  svg.appendChild(gridRect);

  render();
}

// Setup
initGrid();

/* ### Export routines ###################################################### */
function exportSVG() {
  const originalSvg = document.getElementById('feynman-canvas');
  const width = originalSvg.clientWidth;
  const height = originalSvg.clientHeight;

  // Create temporary SVG
  const dummySvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  dummySvg.setAttribute("width", width);
  dummySvg.setAttribute("height", height);
  dummySvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  dummySvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Draw on dummySVG without UI
  render(false, dummySvg);

  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(dummySvg);
  source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

  // Start download
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = "feynman_diagram.svg";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportTypst() {
  alert("Work in progress...");
}


function exportLaTeX() {
  const SCALE = 0.5;

  // Number / coordinate helpers
  const fmt = (n) => {
    const v = +n;
    if (!isFinite(v)) return "0";
    return Number(v.toFixed(3)).toString();
  };
  const PT = (n) => `${fmt(n * SCALE)}pt`;
  const C  = (x, y) => `(${fmt(x*SCALE)}pt,${fmt(-y*SCALE)}pt)`;

  // Color cache
  const colorCache = new Map();
  let colorCounter = 0;
  const tikzColor = (hex) => {
    let h = (hex || defaultColor).toString().replace('#', '').toUpperCase();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9A-F]{6}$/.test(h)) h = "000000";
    if (!colorCache.has(h)) colorCache.set(h, `fdgcol${colorCounter++}`);
    return colorCache.get(h);
  };

  //
  // Edge geometry: same math as render() in feyndrawgrams.js
  //
  const computeEdgeGeom = (edge) => {
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const c  = Math.sqrt(dx*dx + dy*dy);
    let L, getBasePoint;

    if (c < 0.1) {                                            // tadpole
      const Rraw  = edge.curvature || 0;
      const R     = (Rraw === 0 || Math.abs(Rraw) < 2) ? 20 : Math.abs(Rraw);
      L = 2 * Math.PI * R;
      const aBase = (edge.tadpoleAngle !== undefined) ? edge.tadpoleAngle
                                                      : -Math.PI/2;
      const cxT   = edge.x1 + R * Math.cos(aBase);
      const cyT   = edge.y1 + R * Math.sin(aBase);
      const startA = aBase + Math.PI;
      getBasePoint = (t) => {
        const angle = edge.arrowFlip ? startA - t*2*Math.PI
                                     : startA + t*2*Math.PI;
        const tang  = edge.arrowFlip ? angle - Math.PI/2 : angle + Math.PI/2;
        return {
          x: cxT + R*Math.cos(angle),
          y: cyT + R*Math.sin(angle),
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang)
        };
      };
    } else if (edge.curvature === 0) {                        // straight
      L = c;
      getBasePoint = (t) => {
        const tang = Math.atan2(dy, dx);
        return {
          x: edge.x1 + t*dx,
          y: edge.y1 + t*dy,
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang)
        };
      };
    } else {                                                  // arc
      const s   = edge.curvature;
      const R   = Math.abs(s/2 + (c*c)/(8*s));
      const h   = s - R * Math.sign(s);
      const cxA = (edge.x1 + edge.x2)/2 + (-dy/c) * h;
      const cyA = (edge.y1 + edge.y2)/2 + ( dx/c) * h;
      const a1  = Math.atan2(edge.y1 - cyA, edge.x1 - cxA);
      const a2  = Math.atan2(edge.y2 - cyA, edge.x2 - cxA);
      let diff = a2 - a1;
      while (diff >   Math.PI) diff -= 2*Math.PI;
      while (diff <= -Math.PI) diff += 2*Math.PI;
      if (s > 0 && diff > 0)   diff -= 2*Math.PI;
      if (s < 0 && diff < 0)   diff += 2*Math.PI;
      L = R * Math.abs(diff);
      getBasePoint = (t) => {
        const ang  = a1 + diff * t;
        const tang = ang + (s > 0 ? -Math.PI/2 : Math.PI/2);
        return {
          x: cxA + R*Math.cos(ang),
          y: cyA + R*Math.sin(ang),
          tx: Math.cos(tang),  ty: Math.sin(tang),
          nx: -Math.sin(tang), ny: Math.cos(tang)
        };
      };
    }
    return { c, L, getBasePoint };
  };

  //
  // Smooth TikZ path (line / arc / full circle) for an offset
  //
  const buildSmoothPath = (edge, offset) => {
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const c  = Math.sqrt(dx*dx + dy*dy);

    if (c < 0.1) { // tadpole
      const Rraw  = edge.curvature || 0;
      const R     = (Rraw === 0 || Math.abs(Rraw) < 2) ? 20 : Math.abs(Rraw);
      const aBase = (edge.tadpoleAngle !== undefined) ? edge.tadpoleAngle
                                                      : -Math.PI/2;
      const cxT      = edge.x1 + R * Math.cos(aBase);
      const cyT      = edge.y1 + R * Math.sin(aBase);
      const tadSign  = edge.arrowFlip ? +1 : -1;
      const Rn       = R + offset * tadSign;
      const startA   = aBase + Math.PI;
      const startTik = -startA * 180/Math.PI;
      const endTik   = startTik + (edge.arrowFlip ? 360 : -360);
      const sx = cxT + Rn * Math.cos(startA);
      const sy = cyT + Rn * Math.sin(startA);
      return `${C(sx, sy)} arc [start angle=${fmt(startTik)}, ` +
             `end angle=${fmt(endTik)}, radius=${PT(Rn)}]`;
    }
    if (edge.curvature === 0) {
      const nx = -dy/c, ny = dx/c;
      return `${C(edge.x1 + offset*nx, edge.y1 + offset*ny)} -- ` +
             `${C(edge.x2 + offset*nx, edge.y2 + offset*ny)}`;
    }
    // arc
    const s   = edge.curvature;
    const R   = Math.abs(s/2 + (c*c)/(8*s));
    const h   = s - R * Math.sign(s);
    const cxA = (edge.x1 + edge.x2)/2 + (-dy/c) * h;
    const cyA = (edge.y1 + edge.y2)/2 + ( dx/c) * h;
    const a1  = Math.atan2(edge.y1 - cyA, edge.x1 - cxA);
    const a2  = Math.atan2(edge.y2 - cyA, edge.x2 - cxA);
    let diff = a2 - a1;
    while (diff >   Math.PI) diff -= 2*Math.PI;
    while (diff <= -Math.PI) diff += 2*Math.PI;
    if (s > 0 && diff > 0) diff -= 2*Math.PI;
    if (s < 0 && diff < 0) diff += 2*Math.PI;
    const Rn  = R + offset * Math.sign(s);
    const sx  = cxA + Rn * Math.cos(a1);
    const sy  = cyA + Rn * Math.sin(a1);
    const a1T = -a1   * 180/Math.PI;
    const a2T = a1T + (-diff) * 180/Math.PI;
    return `${C(sx, sy)} arc [start angle=${fmt(a1T)}, ` +
           `end angle=${fmt(a2T)}, radius=${PT(Rn)}]`;
  };

  //
  // Polyline (sampled wave) for an offset, identical formula to render()
  //
  const buildWavePolyline = (edge, offset, geom) => {
    const { L, getBasePoint } = geom;
    const isGluon = edge.lineType === 'gluon';
    const lambda  = isGluon ? 12 : 10;
    const mult    = +edge.multiplicity || defaultMultiplicity;
    const A       = (isGluon ? 5 : 3) / mult;
    const m       = Math.max(1, Math.round(L / lambda));
    const steps   = Math.max(20, Math.ceil(3 * L));   // never below 20
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t   = i / steps;
      const pt  = getBasePoint(t);
      const ph  = t * m * 2 * Math.PI;
      const bx  = pt.x + offset * pt.nx;
      const by  = pt.y + offset * pt.ny;
      let px, py;
      if (isGluon) {
        px = bx + A*Math.sin(ph)*pt.nx + A*(Math.cos(ph)-1)*pt.tx;
        py = by + A*Math.sin(ph)*pt.ny + A*(Math.cos(ph)-1)*pt.ty;
      } else {
        px = bx + A*Math.sin(ph)*pt.nx;
        py = by + A*Math.sin(ph)*pt.ny;
      }
      pts.push(C(px, py));
    }
    return pts.join(' -- ');
  };

  //
  // Decide global rendering mode for wavy/gluon edges
  // (any multiple curved photon/gluon -> polyline mode for ALL photons/gluons)
  //
  const useExplicitWaves = inExplicitWaves.checked || state.edges.some(edge => {
    const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
    const c  = Math.sqrt(dx*dx + dy*dy);
    const isCurved =
      (c < 0.1) || (edge.curvature && edge.curvature !== 0);
    const isOsc =
      edge.lineType === 'wavy' || edge.lineType === 'gluon';
    const isMultiple = ( edge.multiplicity !== 1);
    return isCurved && isOsc && isMultiple;
  });

  //
  // 1. EDGES
  //
  let body = '';
  state.edges.forEach(edge => {
    const sw    = +edge.strokeWidth || defaultWidth;
    const color = tikzColor(edge.color);
    const lt    = edge.lineType || defaultLineType;
    const mult  = +edge.multiplicity || defaultMultiplicity;
    const geom  = computeEdgeGeom(edge);

    // Parallel offsets for multiplicity
    let offsets;
    if      (mult === 1) offsets = [0];
    else if (mult === 2) offsets = [-sw*0.8, +sw*0.8];
    else                 offsets = [-1.25*sw, 0, +1.25*sw];

    body += `  % Edge ${edge.id} (${lt}, mult=${mult})\n`;
    const useWavePolyline =
      useExplicitWaves && (lt === 'wavy' || lt === 'gluon');

    offsets.forEach(off => {
      if (useWavePolyline) {
        // Sampled polyline -> in-phase parallel waves
        const pts  = buildWavePolyline(edge, off, geom);
        body += `  \\draw[draw=${color}, line width=${PT(sw)}] ${pts};\n`;
      } else {
        const opts = [`draw=${color}`, `line width=${PT(sw)}`];
        if (lt === 'dashed') {
          const dl = +edge.dashLength || +defaultDashLength;
          opts.push(`dash pattern=on ${PT(dl)} off ${PT(dl)}`);
        } else if (lt === 'wavy') {
          const A = 3 / mult;
          opts.push(`decorate`,
            `decoration={snake, amplitude=${PT(A)}, ` +
            `segment length=${PT(10)}, pre length=0pt, post length=0pt}`);
        } else if (lt === 'gluon') {
          const A = 5 / mult;
          opts.push(`decorate`,
            `decoration={coil, amplitude=${PT(A)}, ` +
            `segment length=${PT(12)}, aspect=0.5, ` +
            `pre length=0pt, post length=0pt}`);
        }
        body += `  \\path[${opts.join(', ')}] ` +
                `${buildSmoothPath(edge, off)};\n`;
      }
    });

    // Arrows (always on the smooth central path)
    if (edge.arrowStart || edge.arrowMid || edge.arrowEnd) {
      const arrowSize = +edge.arrowSize || +defaultArrowSize;
      const tipSize   = arrowSize * 1.5;       // <-- 1.5x bigger
      const tip = `Stealth[length=${PT(tipSize)}, ` +
                  `width=${PT(tipSize*0.8)}, inset=${PT(tipSize*0.3)}]`;

      const isTadpole = (geom.c < 0.1);
      const effFlip   = isTadpole ? false : !!edge.arrowFlip;
      const endOff    = sw * 2.25;
      const midOff    = arrowSize * 0.8;

      const marks = [];
      const pushMark = (pos, useArrow, off) => {
        const cmd   = useArrow ? '\\arrow' : '\\arrowreversed';
        const shift = (useArrow ? +1 : -1) * off;
        marks.push(`mark=at position ${pos} with ` +
                   `{\\pgftransformxshift{${PT(shift)}}${cmd}{${tip}}}`);
      };
      if (edge.arrowStart) pushMark(0,    effFlip,   endOff);
      if (edge.arrowMid)   pushMark(0.5, !effFlip,   midOff);
      if (edge.arrowEnd)   pushMark(1,   !effFlip,   endOff);

      const aOpts = [
        `draw=${color}`,
        `line width=${PT(sw)}`,
        `decorate`,
        `decoration={markings, ${marks.join(', ')}}`
      ];
      body += `  \\path[${aOpts.join(', ')}] ${buildSmoothPath(edge, 0)};\n`;
    }
  });

  //
  // 2. SHAPES + 3. NODES (helpers for filled paths)
  //
  // Emit a filled path. If the fill is a pattern, use the explicit 3-step
  // approach (background fill, pattern overlay, stroke) which is robust
  // also for tiny rectangles.
  const emitFilledPath = (pathCmd, obj, strokeCol, sw, extraOpts = []) => {
    const fillCol = tikzColor(obj.fillColor || defaultFillColor);
    const extra   = extraOpts.length ? ', ' + extraOpts.join(', ') : '';
    if (obj.fillType === 'pattern') {
      const angTk = 90 - (+obj.patAngle    || defaultPatAngle);
      const pw    =       +obj.patWidth    || defaultPatWidth;
      const ps    =       +obj.patSpacing  || defaultPatSpacing;
      const pcol  = tikzColor(obj.patColor || defaultPatColor);
      let s = '';
      s += `  \\path[fill=${fillCol}${extra}] ${pathCmd};\n`;
      s += `  \\path[pattern={Lines[angle=${fmt(angTk)}, ` +
                            `distance=${PT(ps)}, line width=${PT(pw/2)}]}, ` +
                            `pattern color=${pcol}${extra}] ${pathCmd};\n`;
      s += `  \\path[draw=${strokeCol}, line width=${PT(sw)}` +
                            `${extra}] ${pathCmd};\n`;
      return s;
    }
    return `  \\path[draw=${strokeCol}, line width=${PT(sw)}, ` +
           `fill=${fillCol}${extra}] ${pathCmd};\n`;
  };

  // 2. SHAPES
  state.shapes.forEach(shape => {
    const stroke = tikzColor(shape.color || defaultColor);
    const sw     = (shape.strokeWidth !== undefined) ? +shape.strokeWidth : 2;
    let pathCmd;
    if (shape.type === 'circle') {
      pathCmd = `${C(shape.x, shape.y)} ellipse ` +
                `[x radius=${PT(shape.rx)}, y radius=${PT(shape.ry)}]`;
    } else {
      pathCmd = `${C(shape.x, shape.y)} rectangle ` +
                `${C(shape.x + shape.width, shape.y + shape.height)}`;
    }
    body += `  % Shape ${shape.id} (${shape.type})\n`;
    body += emitFilledPath(pathCmd, shape, stroke, sw);
  });

  // 3. NODES
  state.nodes.forEach(node => {
    const stroke = tikzColor(node.color || defaultColor);
    const sw     = +node.strokeWidth || defaultWidth;
    const r      = +node.radius      || defaultNodeRadius;
    const style  = node.nodeStyle    || defaultNodeStyle;
    body += `  % Node ${node.id} (${style})\n`;

    const circlePath = `${C(node.x, node.y)} circle [radius=${PT(r)}]`;
    const rectPath   = `${C(node.x - r, node.y - r)} rectangle ` +
                       `${C(node.x + r, node.y + r)}`;

    if (style === 'solid') {
      // 'solid' style: when fillType is 'solid' the disc is fully painted
      // with the stroke color (matches appendCircle in JS).
      if (node.fillType === 'pattern') {
        body += emitFilledPath(circlePath, node, stroke, sw);
      } else {
        body += `  \\path[draw=${stroke}, line width=${PT(sw)}, ` +
                `fill=${stroke}] ${circlePath};\n`;
      }
    } else if (style === 'odot') {
      body += emitFilledPath(circlePath, node, stroke, sw);
      body += `  \\fill[${stroke}] ${C(node.x, node.y)} ` +
              `circle [radius=${PT(r/3)}];\n`;
    } else if (style === 'otimes') {
      body += emitFilledPath(circlePath, node, stroke, sw);
      const d = r * 0.707;
      body += `  \\draw[${stroke}, line width=${PT(sw)}] ` +
              `${C(node.x - d, node.y - d)} -- ${C(node.x + d, node.y + d)} ` +
              `${C(node.x - d, node.y + d)} -- ${C(node.x + d, node.y - d)};\n`;
    } else if (style === 'square') {
      body += emitFilledPath(rectPath, node, stroke, sw);
    } else if (style === 'diamond') {
      // Wrap in a scope so rotation is applied to the 3-step pattern path
      body += `  \\begin{scope}[rotate around={45:${C(node.x, node.y)}}]\n`;
      body += emitFilledPath(rectPath, node, stroke, sw)
                .split('\n').map(l => l ? '  ' + l : l).join('\n');
      body += `  \\end{scope}\n`;
    }
  });

  //
  // 4. LABELS
  // =========================================================================
  state.labels.forEach(label => {
    body += `  % Label ${label.id}\n`;
    body += `  \\node[inner sep=0pt] at ${C(label.x, label.y)} ` +
            `{${label.text}};\n`;
  });

  //
  // OUTPUT
  //
  let colorDefs = '';
  colorCache.forEach((name, hex) => {
    colorDefs += `\\definecolor{${name}}{HTML}{${hex}}\n`;
  });

  const tex =
`% Feynman diagram exported from FeynDrawGram
% Use with \\input{this-file.tex} inside a tikzpicture-friendly document.
% Required: see the dependency list on the FeynDrawGram page (https://mbarbieri.it/FeynDrawGrams/).
${colorDefs}\\begin{tikzpicture}
${body}\\end{tikzpicture}
`;

  // Trigger download 
  const blob = new Blob([tex], { type: 'text/x-tex;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'feynman_diagram.tex';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function saveDiagram() {
  const data = {
    nodes:  state.nodes,
    edges:  state.edges,
    labels: state.labels,
    shapes: state.shapes
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'feynman_diagram.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function loadDiagram() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (re) => {
      try {
        const data = JSON.parse(re.target.result);
        saveHistory();
        state.nodes  = data.nodes  || [];
        state.edges  = data.edges  || [];
        state.labels = data.labels || [];
        state.shapes = data.shapes || [];
        state.selection = [];
        render();
      } catch (err) {
        alert("Error: invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}