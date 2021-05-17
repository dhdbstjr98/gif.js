/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const GIFEncoder = require("./lib/GIFEncoder.js");

const renderFrame = function (frame) {
  const encoder = new GIFEncoder(frame.width, frame.height);

  if (frame.index === 0) {
    encoder.writeHeader();
  } else {
    encoder.firstFrame = false;
  }

  encoder.setTransparent(frame.transparent);
  encoder.setDispose(frame.dispose);
  encoder.setRepeat(frame.repeat);
  encoder.setDelay(frame.delay);
  encoder.setQuality(frame.quality);
  encoder.setDither(frame.dither);
  encoder.setGlobalPalette(frame.globalPalette);
  encoder.addFrame(frame.data);
  if (frame.last) {
    encoder.finish();
  }
  if (frame.globalPalette === true) {
    frame.globalPalette = encoder.getGlobalPalette();
  }

  const stream = encoder.stream();
  frame.data = stream.pages;
  frame.cursor = stream.cursor;
  frame.pageSize = stream.constructor.pageSize;

  if (frame.canTransfer) {
    const transfer = Array.from(frame.data).map((page) => page.buffer);
    return self.postMessage(frame, transfer);
  } else {
    return self.postMessage(frame);
  }
};

self.onmessage = (event) => renderFrame(event.data);
