const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

export function align(segments, turns, slides, duration) {
  const slideIntervals = slides.map((slide, index) => ({
    ...slide, start: slide.at, end: slides[index + 1]?.at ?? duration,
  }));
  return segments.map((segment, index) => {
    const voices = turns.filter(turn => overlap(segment, turn) > 0);
    const speakers = [...new Set(voices.map(turn => turn.speaker))].sort();
    const simultaneous = voices.some((a, i) => voices.slice(i + 1).some(b =>
      a.speaker !== b.speaker && Math.max(a.start, b.start, segment.start) <
        Math.min(a.end, b.end, segment.end)));
    const coverage = voices.map(voice => [
      Math.max(voice.start, segment.start), Math.min(voice.end, segment.end),
    ]).sort((a, b) => a[0] - b[0]);
    let coveredUntil = segment.start;
    let covered = 0;
    for (const [start, end] of coverage) {
      covered += Math.max(0, end - Math.max(start, coveredUntil));
      coveredUntil = Math.max(coveredUntil, end);
    }
    return {
      ...segment, seek: coverage[0]?.[0] ?? segment.start, id: `passage-${index + 1}`, speakers, simultaneous,
      uncertain: speakers.length !== 1 || covered < (segment.end - segment.start) * 0.75,
      slides: slideIntervals.filter(slide => overlap(segment, slide) > 0).map(({id, title}) => ({id, title})),
    };
  });
}

export function checkReferences(result, passages) {
  const ids = new Set(passages.map(passage => passage.id));
  const {summary, actions} = result;
  if (![summary, actions].every(items => Array.isArray(items) && items.every(item =>
    typeof item.text === 'string' && item.text.trim() && ids.has(item.passageId)))) {
    throw new Error('Een samenvattingsregel of actiepunt mist een geldige transcriptverwijzing.');
  }
  return {summary, actions};
}
