import { Project, IProject } from './project';

type WindowExt = Window &
    typeof globalThis & {
        TestProject: ProjectExports;
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
        (window as WindowExt)['TestProject'] = pageReturn;
    }
    return pageReturn;
})();
