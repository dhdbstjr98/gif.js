const path = require("path");

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
  mode: "development",
  devtool: false,
  resolve: {
    fallback: {
      fs: false,
      stream: require.resolve("stream-browserify"),
    },
  },
};
