/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Path from 'path';
import Webpack from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { Config } from './webpack.utils';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import Ip from 'ip';
import os from 'os';

const nodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const config: Webpack.Configuration & WebpackDevServer.Configuration = {
    devtool: 'source-map',
    mode: 'production',
    entry: {
        pixiSpineTest: './src/index.ts',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/i,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: 'build/tsconfig.bundle.json',
                    },
                },
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            title: Config.outputName,
            template: './build/assets/index.html',
            inject: false,
            filename: 'index.html',
        }),
        new CopyPlugin({
            patterns: [
                { from: Path.join(__dirname, '..', 'assets'), to: Path.join(Config.outPathProd, 'assets') },
            ],
        }),
        new nodePolyfillPlugin(),
        new Webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1
        }),
    ],
    output: {
        filename: Config.outFileName,
        path: Config.outPathProd + '/',
        libraryTarget: 'umd',
        libraryExport: 'default',
        library: Config.outputName,
    },
    resolve: {
        mainFields: ['module', 'main'],
        extensions: ['.ts', '.tsx', '.js', '.vue', '.json', '.d.ts', '.txt', '.skel'],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    sourceMap: true,
                    mangle: true,
                    keep_classnames: true,
                    keep_fnames: true,
                    compress: {
                        drop_console: true,
                    },
                },
                extractComments: false, // Exclude license comments
            }),
        ],
    },
} as any;

export default config;
