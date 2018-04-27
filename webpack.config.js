var webpack = require('webpack');
var path = require('path');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var CleanWebpackPlugin = require('clean-webpack-plugin');


// Output path

var publicPath = '/static/assets/';

// Plugins

var plugins = [];

plugins.push(new ExtractTextPlugin('[name].css', { publicPath: publicPath }));

if (process.env.NODE_ENV === 'production') {
    plugins.push(new webpack.optimize.DedupePlugin());
    plugins.push(new webpack.optimize.OccurenceOrderPlugin());
    plugins.push(new webpack.optimize.UglifyJsPlugin());

    plugins.push(new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
    }));
}

// Config

let outputPath;

if (process.env.NODE_ENV === 'production') {
    outputPath = './build';
} else {
    outputPath = `${__dirname}/../selfmarket/app/static/assets`;
}

// TODO: split bundles to vendor & non-vendor

module.exports = {
    entry: {
        frontend: './src/frontend/index.js',
        account: './src/account/index.js',
        landing: './src/landing/index.js',
        editor: './src/editor/index.js',
        adminPanel: './src/frontend/adminPanel/index.js',
        verificationCenter: './src/account/verificationCenter/index.js'
    },
    debug: process.env.NODE_ENV !== 'production',
    resolve: {
        root: path.join(__dirname, 'src'),
        modulesDirectories: ['node_modules', path.resolve(__dirname, './node_modules')],
        extensions: ['', '.js'],
        alias: {
          'vue$': 'vue/dist/vue.common.js'
        }
    },
    plugins: plugins,
    output: {
        path: outputPath,
        filename: '[name].js',
        publicPath: publicPath
    },
    module: {
        loaders: [
            { test: /\.scss$/, loader: ExtractTextPlugin.extract('css?root=../..!sass') },
            { test: /\.css$/, loader: ExtractTextPlugin.extract('css') },
            { test: /\.gif$/, loader: 'url-loader?limit=5000&mimetype=image/gif' },
            { test: /\.jpg$/, loader: 'url-loader?limit=5000&mimetype=image/jpg' },
            { test: /\.png$/, loader: 'url-loader?limit=5000&mimetype=image/png' },
            { test: /\.svg/, loader: 'svg-url-loader?limit=5000' },
            { test: /\.(woff|woff2|ttf|eot)/, loader: 'url-loader?limit=5000' },
            { test: /\.js$/, loader: 'babel', exclude: [/node_modules/, /build/] }
        ]
    },
    
    devtool: process.env.NODE_ENV !== 'production' ? 'source-map' : null,
    devServer: {
        headers: { 'Access-Control-Allow-Origin': '*' },
        stats: 'errors-only',
        historyApiFallback: {
            index: '/'
        }
    }
};
