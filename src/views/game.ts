import _ from 'lodash';
import * as PIXI from 'pixi.js';
import { createTickEventHandler, ITickEventHandler, ResolvablePromise } from "@gp/utils";
import { SkeletonData, Spine } from '@pixi-spine/all-4.1';
import { SpineObject } from '../models/spineObject';
import * as pixiSpine from "@esotericsoftware/spine-pixi";

export class SpineMachine {
    private app?: PIXI.Application<HTMLCanvasElement>;
    private tickEventHandler: ITickEventHandler = createTickEventHandler();

    private spineObjects: Spine[] = [];
    private static SPINE_COUNT = 100;
    private spineList: SpineObject[] = [{
        name: "Diamond",
        atlasPath: "assets/diamond.atlas",
        jsonPath: "assets/diamond.json",
        texturePath: "assets/diamond.tex1.png"
    }, {
        name: "Theseus",
        atlasPath: "assets/theseus.atlas",
        jsonPath: "assets/theseus.json",
        texturePath: "assets/theseus.tex1.png"
    }];
    private animationList: SpineObject[] = [];
    private selectedSpineIndex: number = 0;
    private selectedAnimIndex: number = 0;

    private readonly maxDropSize = 3;
    private dropZonePromise = new ResolvablePromise<void>();

    constructor() {
        this.app = new PIXI.Application<HTMLCanvasElement>({ 
            background: '#1099bb', 
            width: 800,
            height: 600, 
        });
        document.body.appendChild(this.app.view);

        this.addItemsToList('spine-list', this.spineList);
        this.initElements();
        this.initDropZone();
    }

    private initElements(): void {
        const addButton = document.getElementById('add');
        addButton?.addEventListener('click', async () => {
            await this.addSpineObjects();
        });

        addEventListener('load', () => {
            void this.loadSpineAnimations();
        })
        const spineListMenu = document.getElementById('spine-list') as HTMLSelectElement;
        spineListMenu.addEventListener('change', () => {
            this.resetSpineObjects();

            this.selectedSpineIndex = spineListMenu.selectedIndex;
            void this.loadSpineAnimations();
        });

        const animListMenu = document.getElementById('animation-list') as HTMLSelectElement;
        animListMenu.addEventListener('change', () => {
            this.selectedAnimIndex = animListMenu.selectedIndex;
            this.restartAnimations();
        });

    }

    private addItemsToList(elementId: string, items: SpineObject[]): void {
        const spineListSelect = document.getElementById(elementId) as HTMLSelectElement;
        while (spineListSelect.firstChild) {
            spineListSelect.removeChild(spineListSelect.firstChild);
        }
        spineListSelect.disabled = false;
        items.forEach((spineObject, index) => {
            const option = document.createElement('option');
            option.text = spineObject.name;
            option.value = index.toString();
            spineListSelect.add(option);
        });
    }

    private initDropZone(): void {
        const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
        imagePreview.src = 'assets/drop.png';
        imagePreview.style.display = 'none';

        // Get the element
        const dropZone = document.getElementById('drop-zone');

        // Add event listeners
        // To avoid flickering of the canvas, use 'dragover' on the body and 'dragleave' & 'drop' on the drop zone
        document.addEventListener('dragover', (event) => {
            // Prevent default behavior
            event.preventDefault();
            this.dragHandler(true);
        });
        dropZone?.addEventListener('dragleave', (event) => {
            // Prevent default behavior
            event.preventDefault();
            this.dragHandler(false);
        });

        dropZone?.addEventListener('drop', this.dropHandler.bind(this));
    }

    public async dropHandler(event: DragEvent): Promise<void> {

            // Prevent default behavior
            event.preventDefault();
            this.dragHandler(false);

            // Get the dropped files
            const files = event.dataTransfer?.files;
            if (files?.length !== this.maxDropSize) {
                console.warn(`You dropped ${files?.length} files, not ${this.maxDropSize} (atlas, json, texture)!`);
                return;
            }

            if (files) {
                // Init spine object
                const spineObject: SpineObject = {
                    name: '',
                    atlasPath: '',
                    jsonPath: '',
                    texturePath: '',
                };

                // Loop through the files
                for (let i = 0; i < files.length; i++) {
                    // Create resolvablePromise to wait for drop to finish loading
                    const resolvePromise = new ResolvablePromise<void>();
                    const file = files[i];
                    // Check the file type
                    if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.endsWith('.atlas') || file.name.endsWith('.atlas.txt') || file.name.endsWith('.json')) {
                        // Create file reader
                        const reader = new FileReader();
                        // Read the file as url
                        reader.readAsDataURL(file);

                        reader.onload = () => {
                            // Do something with the file contents
                            const fileContents = reader.result;
                            console.log(`Received file: ${file.name}`);
                            spineObject.name = file.name.split('.').shift() || '';
                            if (file.name.endsWith('.atlas') || file.name.endsWith('.atlas.txt')) {
                                spineObject.atlasPath = fileContents as string;
                            } else if (file.name.endsWith('.json')) {
                                spineObject.jsonPath = fileContents as string;
                            } else if (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg') {
                                spineObject.texturePath = fileContents as string;
                            } else {
                                const dotIndex = file.name.indexOf('.');
                                const extension = file.name.substring(dotIndex);
                                console.warn(`Unsupported file extension: ${extension}`);
                            }
                            resolvePromise.resolve();
                        };
                    } else {
                        console.warn(`Unsupported file type: ${file.type}`);
                        resolvePromise.resolve();
                    }
                    await resolvePromise.promise;
                }
                
                this.spineList.push(spineObject);
                this.addItemsToList('spine-list', this.spineList);
                console.log('Spine object added:', spineObject);
            }
    }

    public init(): void {
        this.createLogo();
    }

    private dragHandler(hasEntered: boolean): void {
        // Get the drop zone
        const dropZone = document.getElementById('drop-zone');
        dropZone!.style.pointerEvents = hasEntered ? "auto" : "none";

        // Show/Hide the image preview items are dropped
        const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
        imagePreview.style.display = hasEntered ?  'block' : 'none';
        // Show/Hide pixi app
        if (this.app) {
            this.app.view.style.display = hasEntered ?  'none' : 'inline';
        }
    }

    private updateCounter(): void {
        const count: HTMLElement = document.getElementById('count')!;
        count.innerText = `${this.spineObjects.length} Spine Objects`;
    }

    private addSpineObjects(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const spineObject = this.spineList[this.selectedSpineIndex];
            PIXI.Assets.load(spineObject.jsonPath!).then((spineData) => {
                if (!spineData) {
                    console.error('Failed to load spine character.');
                    return;
                }

                for (let i = 0; i < SpineMachine.SPINE_COUNT; i++) {
                    this.createSpineObject(spineData.spineData);            // Create a new Spine animation
                }
                this.updateCounter();
                resolve();
            }).catch((error) => {
                console.error('Error loading assets:', error);
                reject(error);
            });
        })
        
    }

    private loadSpineAnimations(): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            const spineObject = this.spineList[this.selectedSpineIndex];
            // PIXI.Assets.add({ alias: '', src: require(spineObject.texturePath) });
            // PIXI.Assets.add({ alias: 'skeleton', src: require(spineObject.jsonPath) });
            // PIXI.Assets.add({ alias: 'atlas', src: require(spineObject.atlasPath) });
            // await PIXI.Assets.load(['skeleton', 'atlas']);
            // const boy = pixiSpine.Spine.from('skeleton', 'atlas', {autoUpdate: true});
            // console.error(boy);

            // pixiSpine.AttachmentLoader()
            // const skeleton = new pixiSpine.SkeletonJson();
            // resolve();
            PIXI.Assets.load(spineObject.jsonPath!).then((spineData) => {
                if (!spineData) {
                    console.error('Failed to load spine character.');
                    return;
                }

                this.createSpineObject(spineData.spineData, true); // Create a new Spine animation
                resolve();
            }).catch((error) => {
                console.error('Error loading assets:', error);
                reject(error);
            });
        })
    }

    private createSpineObject(spineData: SkeletonData, getAnimationsOnly = false): void {
        const spineObject = new Spine(spineData);

        if (getAnimationsOnly) {
            // Set the animation to play
            this.animationList.splice(0);
            spineObject.spineData.animations.forEach((animation) => {
                this.animationList.push({
                    name: animation.name,
                });
            });
            // Add the animation to the dropdown list
            this.addItemsToList('animation-list', spineObject.spineData.animations);
            spineObject.destroy();
        } else {
            // Randomly position the spine animation within the given range
            spineObject.x = 50 + Math.random() * 700; // Random x between 0 and 700
            spineObject.y = 25 + Math.random() * 500; // Random y between 0 and 500
            spineObject.scale.set(0.2, 0.2);

            // Start animation
            if (this.animationList.length > 0) {
                spineObject.state.setAnimation(0, this.animationList[this.selectedAnimIndex].name, true);
            }

            // Add the spine character to the stage
            this.app?.stage.addChild(spineObject);
            this.spineObjects.push(spineObject);
        }
    }

    private restartAnimations(): void {
        this.spineObjects.forEach((spineObject) => {
            spineObject.state.setAnimation(0, this.animationList[this.selectedAnimIndex].name, true);
        });
    }

    private resetSpineObjects(): void {
        this.spineObjects.forEach((spineObject) => {
            spineObject.destroy();
        });
        this.spineObjects.splice(0);
        this.updateCounter();
    }

    private createLogo(): void {
        const logo = new PIXI.Sprite(PIXI.Texture.from('https://i.imgur.com/UjL9rZJ.png'));
        logo.scale.set(0.5);
        logo.anchor.set(0.5);
        logo.x = 400;
        logo.y = 550;
        this.app?.stage?.addChild(logo);
      }

    private lastTime = Date.now();
    public update(): void {
        const updater = (): void => {
            const currentTime = Date.now();            
            const deltaTime = currentTime - this.lastTime;  
            this.lastTime = currentTime;
            this.tickEventHandler.updateEvents(deltaTime * 0.001);
            requestAnimationFrame(updater);
        };
        updater();
    }

}