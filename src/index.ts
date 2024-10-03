import { Project, IProject } from './project';

type WindowExt = Window &
    typeof globalThis & {
        PixiSpineTest: ProjectExports;
    };

interface ProjectExports {
    launch: () => void;
}

export default ((): ProjectExports => {
    const inClosure: IProject = new Project();
    const pageReturn: ProjectExports = {
        launch: inClosure.launch.bind(inClosure),
    };
    if (typeof window !== undefined) {
        (window as WindowExt)['PixiSpineTest'] = pageReturn;
    }
    return pageReturn;
})();
