// Import WaveSurfer as ES Module
import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js';

// Initialize WaveSurfer
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: '#555',
  progressColor: '#29a0ff',
  cursorColor: '#fff',
  backend: 'MediaElement', // support video too
  height: 200,
});

// Initialize Fabric canvas for drawing overlay
const overlay = document.getElementById('overlay');
const fabricCanvas = new fabric.Canvas(overlay, {
  isDrawingMode: true,
  backgroundColor: 'transparent'
});
fabricCanvas.freeDrawingBrush.width = 5;
fabricCanvas.freeDrawingBrush.color = '#fff';

// Resize overlay canvas to fit waveform container
function resizeCanvas() {
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
  fabricCanvas.setWidth(overlay.width);
  fabricCanvas.setHeight(overlay.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Tool selection handlers
document.getElementById('tool-pencil').onclick = () => { fabricCanvas.isDrawingMode = true; fabricCanvas.freeDrawingBrush.color = colorPicker.value; };
document.getElementById('tool-eraser').onclick = () => { fabricCanvas.isDrawingMode = true; fabricCanvas.freeDrawingBrush.color = '#121212'; };
document.getElementById('tool-line').onclick = () => { startLineTool(); };
document.getElementById('tool-rect').onclick = () => { startRectTool(); };
document.getElementById('tool-arrow').onclick = () => { startArrowTool(); };
document.getElementById('tool-text').onclick = () => { addText(); };

const colorPicker = document.getElementById('color-picker');
colorPicker.onchange = () => { fabricCanvas.freeDrawingBrush.color = colorPicker.value; };
const sizePicker = document.getElementById('size-picker');
sizePicker.oninput = () => { fabricCanvas.freeDrawingBrush.width = parseInt(sizePicker.value, 10); };

// Undo/Redo stacks
let undoStack = [], redoStack = [], lockHistory = false;
fabricCanvas.on('object:added', () => { if (!lockHistory) undoStack.push(fabricCanvas.toDatalessJSON()); });
function undo() {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    lockHistory = true;
    fabricCanvas.loadFromJSON(undoStack[undoStack.length-1], () => { fabricCanvas.renderAll(); lockHistory = false; });
  }
}
function redo() {
  if (redoStack.length > 0) {
    undoStack.push(redoStack.pop());
    lockHistory = true;
    fabricCanvas.loadFromJSON(undoStack[undoStack.length-1], () => { fabricCanvas.renderAll(); lockHistory = false; });
  }
}
document.getElementById('undo').onclick = undo;
document.getElementById('redo').onclick = redo;

// Initial undo snapshot
undoStack.push(fabricCanvas.toDatalessJSON());

// Audio/Video file upload handling
document.getElementById('file-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const blob = new Blob([new Uint8Array(evt.target.result)]);
    wavesurfer.loadBlob(blob);
  };
  reader.readAsArrayBuffer(file);
});

// Sync timeline scrubber with wavesurfer
const timeRange = document.getElementById('time-range');
const timeDisplay = document.getElementById('time-display');
wavesurfer.on('ready', () => {
  timeRange.max = Math.floor(wavesurfer.getDuration());
});
wavesurfer.on('audioprocess', () => {
  const sec = Math.floor(wavesurfer.getCurrentTime());
  timeRange.value = sec;
  timeDisplay.textContent = new Date(sec * 1000).toISOString().substr(14, 5);
});
timeRange.oninput = () => {
  wavesurfer.seekTo(timeRange.value / wavesurfer.getDuration());
};

// Image upload (PNG/JPG) and dragging
document.getElementById('image-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(f) {
    fabric.Image.fromURL(f.target.result, function(img) {
      img.set({ left: 50, top: 50, selectable: true });
      fabricCanvas.add(img);
      // Add lock toggle
      img.on('selected', () => { 
        // On double-click maybe, toggle locking movement
        img.lockMovementX = img.lockMovementY = !img.lockMovementX;
        img.set({ selectable: !img.lockMovementX });
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
      });
    });
  };
  reader.readAsDataURL(file);
});

// Drawing tool implementations (line, rectangle, arrow, text)
function startLineTool() {
  fabricCanvas.isDrawingMode = false;
  let line, isDown = false;
  fabricCanvas.off('mouse:down').off('mouse:move').off('mouse:up');
  fabricCanvas.on('mouse:down', function(o) {
    isDown = true;
    const pointer = fabricCanvas.getPointer(o.e);
    line = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: colorPicker.value,
      strokeWidth: parseInt(sizePicker.value,10),
    });
    fabricCanvas.add(line);
  });
  fabricCanvas.on('mouse:move', function(o) {
    if (!isDown) return;
    const pointer = fabricCanvas.getPointer(o.e);
    line.set({ x2: pointer.x, y2: pointer.y });
    fabricCanvas.renderAll();
  });
  fabricCanvas.on('mouse:up', function(o) {
    isDown = false;
    undoStack.push(fabricCanvas.toDatalessJSON());
  });
}
function startRectTool() {
  fabricCanvas.isDrawingMode = false;
  let rect, isDown = false, startX, startY;
  fabricCanvas.off('mouse:down').off('mouse:move').off('mouse:up');
  fabricCanvas.on('mouse:down', function(o) {
    isDown = true;
    const pointer = fabricCanvas.getPointer(o.e);
    startX = pointer.x; startY = pointer.y;
    rect = new fabric.Rect({
      left: startX, top: startY,
      width: 0, height: 0,
      fill: 'transparent',
      stroke: colorPicker.value,
      strokeWidth: parseInt(sizePicker.value,10),
    });
    fabricCanvas.add(rect);
  });
  fabricCanvas.on('mouse:move', function(o) {
    if (!isDown) return;
    const pointer = fabricCanvas.getPointer(o.e);
    rect.set({ width: Math.abs(pointer.x - startX), height: Math.abs(pointer.y - startY) });
    if (pointer.x < startX) rect.set({ left: pointer.x });
    if (pointer.y < startY) rect.set({ top: pointer.y });
    fabricCanvas.renderAll();
  });
  fabricCanvas.on('mouse:up', function(o) {
    isDown = false;
    undoStack.push(fabricCanvas.toDatalessJSON());
  });
}
function startArrowTool() {
  // Simple implementation: draw a line and add an arrowhead triangle
  startLineTool();
  // For brevity, arrowhead drawing omitted; use line with arrow in production.
}
function addText() {
  fabricCanvas.isDrawingMode = false;
  const text = new fabric.IText('Insert text', {
    left: 100, top: 100, fill: colorPicker.value, fontSize: 24
  });
  fabricCanvas.add(text).setActiveObject(text);
  undoStack.push(fabricCanvas.toDatalessJSON());
}
