/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Path from 'path';
import Webpack, { NormalModuleReplacementPlugin, ProvidePlugin } from 'webpack';
import WebpackDevServer from 'webpack-dev-server';
import { Config } from './webpack.utils';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import { getIpAddress } from './networkHelper';

const nodePolyfillPlugin = require('node-polyfill-webpack-plugin');


const config: Webpack.Configuration & WebpackDevServer.Configuration = {
    devtool: 'source-map',
    mode: 'development',
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
    devServer: {
        host: getIpAddress(),
        port: 8080,
        client: {
            overlay: true,
        },
        devMiddleware: {
            writeToDisk: true,
        },
        open: 'index.html',
        static: [{ directory: Config.outPath }],
    } as any,
    plugins: [
        new HtmlWebpackPlugin({
            title: Config.outputName,
            template: './build/assets/index.html',
            inject: false,
            filename: 'index.html',
        }),
        new CopyPlugin({
            patterns: [
                { from: Path.join(__dirname, '..', 'assets'), to: Path.join(Config.outPath, 'assets') },
            ],
        }),
        new nodePolyfillPlugin(),
    ],
    output: {
        filename: Config.outFileName,
        path: Config.outPath + '/',
        libraryTarget: 'umd',
        libraryExport: 'default',
        library: Config.outputName,
        hotUpdateChunkFilename: 'hot/hot-update.js',
        hotUpdateMainFilename: 'hot/hot-update.json',
    },
    resolve: {
        mainFields: ['module', 'main'],
        extensions: ['.ts', '.tsx', '.js', '.vue', '.json', '.d.ts'],
    },
} as any;

export default config;
