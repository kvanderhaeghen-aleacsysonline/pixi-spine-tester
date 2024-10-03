import * as Path from 'path';

export class Config {
    public static readonly outputName = 'pixiSpineTest';
    public static readonly outPath: string = Path.join(__dirname, '..', 'dist', 'dev');
    public static readonly outPathProd: string = Path.join(__dirname, '..', 'dist', 'prod');
    public static readonly outFileName: string = Config.outputName + '.js';
}
