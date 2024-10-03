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

const useLocalNetworkAddress = true;
const networkInterfaces = os.networkInterfaces();
const nonLocalInterfaces: Record<string, os.NetworkInterfaceInfo[]> = {};
let myNetworkAddress: string = Ip.address();
if (useLocalNetworkAddress) {
    for (const inet in networkInterfaces) {
        const addresses = networkInterfaces[inet]!;
        for (let i = 0; i < addresses.length; i++) {
            const address = addresses[i];
            if (!address.internal) {
                if (!nonLocalInterfaces[inet]) {
                    nonLocalInterfaces[inet] = [];
                }
                nonLocalInterfaces[inet].push(address);
                if (address.address.includes('192.168')) {
                    if(address.address !== '192.168.0.1') {
                        myNetworkAddress = address.address;
                    }
                }
            }
        }
    }
    // console.log(nonLocalInterfaces);
}


const config: Webpack.Configuration & WebpackDevServer.Configuration = {
    devtool: 'source-map',
    mode: 'production',
    entry: {
        testProject: './src/index.ts',
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
    ],
    output: {
        filename: Config.outFileName,
        path: Config.outPathProd + '/',
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
