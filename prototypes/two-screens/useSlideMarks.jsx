import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';

const emptyMarks = {cursor:null, selection:null, drag:null};
const clamp = value => Math.max(0, Math.min(1, value));

function slidePoint(slide, x, y) {
  const rect = slide.getBoundingClientRect();
  return {
    x: clamp((x - rect.left + slide.scrollLeft) / Math.max(1, slide.scrollWidth)),
    y: clamp((y - rect.top + slide.scrollTop) / Math.max(1, slide.scrollHeight)),
  };
}

function bounds(start, end) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
}

const selectionBlocks = '[data-selection-block]';

function* textNodes(block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) yield node;
}

function readSelection(slide, range) {
  const segments = [];
  for (const block of slide.querySelectorAll(selectionBlocks)) {
    if (!range.intersectsNode(block)) continue;
    let offset = 0;
    let start;
    let end;
    for (const node of textNodes(block)) {
      if (range.intersectsNode(node)) {
        start ??= offset + (node === range.startContainer ? range.startOffset : 0);
        end = offset + (node === range.endContainer ? range.endOffset : node.length);
      }
      offset += node.length;
    }
    if (start < end) segments.push({block:block.dataset.selectionBlock, start, end});
  }
  return segments.length ? segments : null;
}

function selectionBoxes(slide, segments, geometry) {
  if (!Array.isArray(segments)) return [];
  const origin = slide.getBoundingClientRect();
  const blocks = Array.from(slide.querySelectorAll(selectionBlocks));
  const range = document.createRange();
  const boxes = [];

  for (const segment of segments) {
    const block = blocks.find(node => node.dataset.selectionBlock === segment.block);
    if (!block) continue;
    let offset = 0;
    for (const node of textNodes(block)) {
      const start = Math.max(0, segment.start - offset);
      const end = Math.min(node.length, segment.end - offset);
      offset += node.length;
      if (start >= end) continue;
      range.setStart(node, start);
      range.setEnd(node, end);
      for (const rect of range.getClientRects()) {
        if (rect.width === 0 || rect.height === 0) continue;
        boxes.push({
          left:rect.left - origin.left + geometry.x, top:rect.top - origin.top + geometry.y,
          width:rect.width, height:rect.height,
        });
      }
    }
  }
  return boxes;
}

export function useSlideMarks(slideRef, slideIndex, sendMarks, isPeerMessage) {
  const local = useRef(emptyMarks);
  const frame = useRef(null);
  const drag = useRef(null);
  const [own, setOwn] = useState(emptyMarks);
  const [peer, setPeer] = useState(emptyMarks);
  const [geometry, setGeometry] = useState(null);

  function measure() {
    const slide = slideRef.current;
    setGeometry({
      width:slide.scrollWidth, height:slide.scrollHeight,
      x:slide.scrollLeft, y:slide.scrollTop,
    });
  }

  function update(changes, immediate = false) {
    local.current = {...local.current, ...changes};
    if (immediate && frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const flush = () => {
      frame.current = null;
      setOwn(local.current);
      sendMarks({slide:slideIndex, marks:local.current});
    };
    if (immediate) flush();
    else if (frame.current === null) frame.current = requestAnimationFrame(flush);
  }

  function endDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    update({drag:null}, true);
  }

  useLayoutEffect(() => {
    const slide = slideRef.current;
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(slide);
    observer?.observe(slide.firstElementChild);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [slideIndex]);

  useEffect(() => {
    const receive = event => {
      if (isPeerMessage(event) && event.data.payload?.slide === slideIndex) {
        setPeer(event.data.payload.marks ?? emptyMarks);
      }
    };
    const clear = () => {
      drag.current = null;
      update(emptyMarks, true);
    };
    const select = () => {
      const slide = slideRef.current;
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed ||
          !slide.contains(selection.anchorNode) || !slide.contains(selection.focusNode)) {
        if (local.current.selection) update({selection:null});
        return;
      }
      update({selection:readSelection(slide, selection.getRangeAt(0))});
    };
    window.addEventListener('message', receive);
    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    document.addEventListener('selectionchange', select);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      local.current = emptyMarks;
      drag.current = null;
      setOwn(emptyMarks);
      setPeer(emptyMarks);
      window.removeEventListener('message', receive);
      window.removeEventListener('blur', clear);
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('selectionchange', select);
    };
  }, [slideIndex, sendMarks, isPeerMessage]);

  const handlers = {
    onPointerDown(event) {
      if (event.button !== 2) return;
      event.preventDefault();
      const slide = event.currentTarget;
      const start = slidePoint(slide, event.clientX, event.clientY);
      drag.current = {start, pointerId:event.pointerId};
      slide.setPointerCapture?.(event.pointerId);
      update({cursor:start, drag:bounds(start, start)});
    },
    onPointerMove(event) {
      const cursor = slidePoint(event.currentTarget, event.clientX, event.clientY);
      const active = drag.current;
      if (active?.pointerId === event.pointerId && !(event.buttons & 2)) {
        drag.current = null;
        update({cursor, drag:null}, true);
      } else {
        update(active?.pointerId === event.pointerId ? {cursor, drag:bounds(active.start, cursor)} : {cursor});
      }
    },
    onPointerUp(event) {
      if (event.button === 2) endDrag(event);
    },
    onPointerCancel: endDrag,
    onLostPointerCapture: endDrag,
    onPointerLeave() {
      update({cursor:null});
    },
    onContextMenu(event) {
      event.preventDefault();
    },
  };

  return {handlers, measure, own, peer, geometry};
}

export function SlideMarks({slideRef, slideIndex, own, peer, geometry}) {
  const [selections, setSelections] = useState({local:[], peer:[]});
  const localSelection = own.selection;
  const peerSelection = peer.selection;
  useLayoutEffect(() => {
    if (!geometry) return;
    const slide = slideRef.current;
    setSelections({
      local:selectionBoxes(slide, localSelection, geometry),
      peer:selectionBoxes(slide, peerSelection, geometry),
    });
  }, [slideRef, slideIndex, geometry, localSelection, peerSelection]);

  if (!geometry) return null;
  return (
    <div className="slide-marks" aria-hidden="true">
      <div className="slide-mark-coordinates" style={{
        width:geometry.width, height:geometry.height,
        transform:`translate(${-geometry.x}px, ${-geometry.y}px)`,
      }}>
        {[[own, 'local'], [peer, 'peer']].map(([marks, owner]) => (
          <div key={owner} className={`slide-mark-owner ${owner}`}>
            {selections[owner].map((box, index) => (
              <div key={index} className="slide-mark-box selection" style={box}/>
            ))}
            {marks.drag && <div className="slide-mark-box drag" style={{
              left:`${marks.drag.left * 100}%`, top:`${marks.drag.top * 100}%`,
              width:`${marks.drag.width * 100}%`, height:`${marks.drag.height * 100}%`,
            }}/>}
            {owner === 'peer' && marks.cursor && <div className="slide-peer-cursor" style={{
              left:`${marks.cursor.x * 100}%`, top:`${marks.cursor.y * 100}%`,
            }}/>}
          </div>
        ))}
      </div>
    </div>
  );
}
