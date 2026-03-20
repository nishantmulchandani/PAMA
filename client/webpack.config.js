const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/consolidated-entry.jsx',
    output: {
      path: path.resolve(__dirname, '../'), // Output to root extension folder
      filename: 'pama-consolidated.bundle.js',
      clean: false, // Don't remove other files in output directory
    },
    resolve: {
      extensions: ['.js', '.jsx'],
    },
    module: {
      rules: [
        // JavaScript/React
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react'],
            },
          },
        },
        // CSS
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader',
          ],
        },
        // Images (if needed)
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'assets/[name][ext]',
          },
        },
      ],
    },
    plugins: [
      // Extract CSS into separate file
      new MiniCssExtractPlugin({
        filename: 'styles.css',
      }),
      // Copy HTML files
      new CopyWebpackPlugin({
        patterns: [
          {
            from: './public/index.html',
            to: 'index.html'
          },
          {
            from: './public/simple-index.html',
            to: 'simple-index.html'
          },
          {
            from: './public/minimal.html',
            to: 'minimal.html'
          },
          {
            from: './public/localServer.html',
            to: 'localServer.html'
          },
          {
            from: './public/CSInterface.js',
            to: 'CSInterface.js'
          }
        ],
      }),
    ],
    devtool: isProduction ? false : 'source-map',
    optimization: {
      minimize: isProduction,
      splitChunks: false, // Keep everything in a single bundle like bodymovin
    },
    performance: {
      // Increase size limits to match bodymovin's large bundle approach
      maxAssetSize: 500000,
      maxEntrypointSize: 500000,
      hints: isProduction ? 'warning' : false
    },
    // Development server for testing (though in actual use, this runs inside AE)
    devServer: {
      static: {
        directory: path.join(__dirname, '../'),
      },
      port: 3000,
      hot: true,
    },
  };
};