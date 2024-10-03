import { SpineMachine } from "./views/game";

export interface IProject {
    launch(): void;
}

export class Project implements IProject {
    public launch(): void {
        const slotMachine: SpineMachine = new SpineMachine();
        slotMachine.init();
        slotMachine.update();
    }
}
