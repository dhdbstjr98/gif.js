const path = require("path");
const { webpack } = require("webpack");

const file = process.argv[3] ? process.argv[3] : "gif.js";

switch (file) {
  case "gif.js":
    module.exports = {
      entry: "./src/index.js",
      output: {
        path: __dirname + "/dist",
        filename: "gif.js",
        library: "gif.js",
        libraryTarget: "umd",
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            include: [path.resolve(__dirname, "src/js")],
            exclude: /node_modules/,
          },
          {
            test: /\.txt$/i,
            use: "raw-loader",
          },
        ],
      },
      optimization: {
        minimize: true,
      },
      mode: "development",
      devtool: false,
      resolve: {
        fallback: {
          fs: false,
          stream: require.resolve("stream-browserify"),
        },
      },
    };
    break;
  case "gif.worker.js":
    module.exports = {
      entry: "./src/gif.worker.js",
      output: {
        path: __dirname + "/dist",
        filename: "gif.worker.js.txt",
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            include: [path.resolve(__dirname, "src/js")],
            exclude: /node_modules/,
          },
        ],
      },
      optimization: {
        minimize: true,
      },
      mode: "development",
      devtool: false,
      resolve: {
        fallback: {
          fs: false,
          stream: require.resolve("stream-browserify"),
        },
      },
    };
    break;
}
