/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS203: Remove `|| {}` from converted for-own loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { EventEmitter } = require("events");
const browser = require("./browser");
const fs = require("fs");

import workerScript from "./gif.worker.js.txt";

var GIF = (function () {
  let defaults = undefined;
  let frameDefaults = undefined;
  GIF = class GIF extends EventEmitter {
    static initClass() {
      defaults = {
        workers: 2,
        repeat: 0, // repeat forever, -1 = repeat once
        background: "#fff",
        quality: 10, // pixel sample interval, lower is better
        width: null, // size derermined from first frame if possible
        height: null,
        transparent: null,
        debug: false,
        dither: false, // see GIFEncoder.js for dithering options
      };

      frameDefaults = {
        delay: 500, // ms
        copy: false,
        dispose: -1,
      };
    }

    constructor(options) {
      super();
      this.running = false;

      this.options = {};
      this.frames = [];

      this.freeWorkers = [];
      this.activeWorkers = [];

      this.setOptions(options);
      for (let key in defaults) {
        const value = defaults[key];
        if (this.options[key] == null) {
          this.options[key] = value;
        }
      }

      this.workerURL = window.URL.createObjectURL(new Blob([workerScript]));
    }

    setOption(key, value) {
      this.options[key] = value;
      if (this._canvas != null && ["width", "height"].includes(key)) {
        return (this._canvas[key] = value);
      }
    }

    setOptions(options) {
      return (() => {
        const result = [];
        for (let key of Object.keys(options || {})) {
          const value = options[key];
          result.push(this.setOption(key, value));
        }
        return result;
      })();
    }

    addFrame(image, options) {
      if (options == null) {
        options = {};
      }
      const frame = {};
      frame.transparent = this.options.transparent;
      for (let key in frameDefaults) {
        frame[key] = options[key] || frameDefaults[key];
      }

      // use the images width and height for options unless already set
      if (this.options.width == null) {
        this.setOption("width", image.width);
      }
      if (this.options.height == null) {
        this.setOption("height", image.height);
      }

      if (
        typeof ImageData !== "undefined" &&
        ImageData !== null &&
        image instanceof ImageData
      ) {
        frame.data = image.data;
      } else if (
        (typeof CanvasRenderingContext2D !== "undefined" &&
          CanvasRenderingContext2D !== null &&
          image instanceof CanvasRenderingContext2D) ||
        (typeof WebGLRenderingContext !== "undefined" &&
          WebGLRenderingContext !== null &&
          image instanceof WebGLRenderingContext)
      ) {
        if (options.copy) {
          frame.data = this.getContextData(image);
        } else {
          frame.context = image;
        }
      } else if (image.childNodes != null) {
        if (options.copy) {
          frame.data = this.getImageData(image);
        } else {
          frame.image = image;
        }
      } else {
        throw new Error("Invalid image");
      }

      return this.frames.push(frame);
    }

    render() {
      let i;
      if (this.running) {
        throw new Error("Already running");
      }

      if (this.options.width == null || this.options.height == null) {
        throw new Error("Width and height must be set prior to rendering");
      }

      this.running = true;
      this.nextFrame = 0;
      this.finishedFrames = 0;

      this.imageParts = (() => {
        let asc, end;
        const result = [];
        for (
          i = 0, end = this.frames.length, asc = 0 <= end;
          asc ? i < end : i > end;
          asc ? i++ : i--
        ) {
          result.push(null);
        }
        return result;
      })();
      const numWorkers = this.spawnWorkers();
      // we need to wait for the palette
      if (this.options.globalPalette === true) {
        this.renderNextFrame();
      } else {
        let asc1, end1;
        for (
          i = 0, end1 = numWorkers, asc1 = 0 <= end1;
          asc1 ? i < end1 : i > end1;
          asc1 ? i++ : i--
        ) {
          this.renderNextFrame();
        }
      }

      this.emit("start");
      return this.emit("progress", 0);
    }

    abort() {
      while (true) {
        const worker = this.activeWorkers.shift();
        if (worker == null) {
          break;
        }
        this.log("killing active worker");
        worker.terminate();
      }
      this.running = false;
      return this.emit("abort");
    }

    // private

    spawnWorkers() {
      const numWorkers = Math.min(this.options.workers, this.frames.length);
      __range__(this.freeWorkers.length, numWorkers, false).forEach((i) => {
        this.log(`spawning worker ${i}`);
        const worker = new Worker(this.workerURL);
        worker.onmessage = (event) => {
          this.activeWorkers.splice(this.activeWorkers.indexOf(worker), 1);
          this.freeWorkers.push(worker);
          return this.frameFinished(event.data);
        };
        return this.freeWorkers.push(worker);
      });
      return numWorkers;
    }

    frameFinished(frame) {
      this.log(
        `frame ${frame.index} finished - ${this.activeWorkers.length} active`
      );
      this.finishedFrames++;
      this.emit("progress", this.finishedFrames / this.frames.length);
      this.imageParts[frame.index] = frame;
      // remember calculated palette, spawn the rest of the workers
      if (this.options.globalPalette === true) {
        this.options.globalPalette = frame.globalPalette;
        this.log("global palette analyzed");
        if (this.frames.length > 2) {
          for (
            let i = 1, end = this.freeWorkers.length, asc = 1 <= end;
            asc ? i < end : i > end;
            asc ? i++ : i--
          ) {
            this.renderNextFrame();
          }
        }
      }
      if (Array.from(this.imageParts).includes(null)) {
        return this.renderNextFrame();
      } else {
        return this.finishRendering();
      }
    }

    finishRendering() {
      let frame;
      let len = 0;
      for (frame of Array.from(this.imageParts)) {
        len += (frame.data.length - 1) * frame.pageSize + frame.cursor;
      }
      len += frame.pageSize - frame.cursor;
      this.log(`rendering finished - filesize ${Math.round(len / 1000)}kb`);
      const data = new Uint8Array(len);
      let offset = 0;
      for (frame of Array.from(this.imageParts)) {
        for (let i = 0; i < frame.data.length; i++) {
          const page = frame.data[i];
          data.set(page, offset);
          if (i === frame.data.length - 1) {
            offset += frame.cursor;
          } else {
            offset += frame.pageSize;
          }
        }
      }

      const image = new Blob([data], { type: "image/gif" });

      return this.emit("finished", image, data);
    }

    renderNextFrame() {
      if (this.freeWorkers.length === 0) {
        throw new Error("No free workers");
      }
      if (this.nextFrame >= this.frames.length) {
        return;
      } // no new frame to render

      const frame = this.frames[this.nextFrame++];
      const worker = this.freeWorkers.shift();
      const task = this.getTask(frame);

      this.log(`starting frame ${task.index + 1} of ${this.frames.length}`);
      this.activeWorkers.push(worker);
      return worker.postMessage(task); //, [task.data.buffer]
    }

    getContextData(ctx) {
      return ctx.getImageData(0, 0, this.options.width, this.options.height)
        .data;
    }

    getImageData(image) {
      if (this._canvas == null) {
        this._canvas = document.createElement("canvas");
        this._canvas.width = this.options.width;
        this._canvas.height = this.options.height;
      }

      const ctx = this._canvas.getContext("2d");
      ctx.fillStyle = this.options.background;
      ctx.fillRect(0, 0, this.options.width, this.options.height);
      ctx.drawImage(image, 0, 0);

      return this.getContextData(ctx);
    }

    getTask(frame) {
      const index = this.frames.indexOf(frame);
      const task = {
        index,
        last: index === this.frames.length - 1,
        delay: frame.delay,
        dispose: frame.dispose,
        transparent: frame.transparent,
        width: this.options.width,
        height: this.options.height,
        quality: this.options.quality,
        dither: this.options.dither,
        globalPalette: this.options.globalPalette,
        repeat: this.options.repeat,
        canTransfer: browser.name === "chrome",
      };

      if (frame.data != null) {
        task.data = frame.data;
      } else if (frame.context != null) {
        task.data = this.getContextData(frame.context);
      } else if (frame.image != null) {
        task.data = this.getImageData(frame.image);
      } else {
        throw new Error("Invalid frame");
      }

      return task;
    }

    log(...args) {
      if (!this.options.debug) {
        return;
      }
      return console.log(...Array.from(args || []));
    }
  };
  GIF.initClass();
  return GIF;
})();

export default GIF;

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
