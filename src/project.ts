import { SpineMachine } from "./views/game";

export interface IProject {
    launch(): void;
}

export class Project implements IProject {
    public async launch(): Promise<void> {
        const slotMachine: SpineMachine = new SpineMachine();
        await slotMachine.init();
        slotMachine.update();
    }
}
