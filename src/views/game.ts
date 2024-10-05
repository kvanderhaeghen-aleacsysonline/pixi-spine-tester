import _ from 'lodash';
import * as PIXI from 'pixi.js';
import { createTickEventHandler, ITickEventHandler, ResolvablePromise } from "@gp/utils";
import { SkeletonData, Spine } from '@pixi-spine/all-4.1';
import { AtlasAttachmentLoader, SkeletonJson } from '@pixi-spine/runtime-4.1';
import * as pixiSpine from 'pixi-spine';
import * as newSpine from '@esotericsoftware/spine-pixi';
import { SpineObject } from '../models/spineObject';

export class SpineMachine {
    private app?: PIXI.Application<HTMLCanvasElement>;
    private tickEventHandler: ITickEventHandler = createTickEventHandler();

    private objectContainer: PIXI.Container = new PIXI.Container();
    private pinchCenter: { x: number, y: number } = { x: 0, y: 0 };
    private pinchDistance: number = 0;

    private addButton: HTMLButtonElement;
    private moveButton: HTMLButtonElement;
    private spineListMenu: HTMLSelectElement;
    private animationListMenu: HTMLSelectElement;

    private static SPINE_ADD_COUNT = 100;
    private spinePreview?: Spine;
    private spineObjects: Spine[] = [];
    private spineList: SpineObject[] = [{
        name: "Diamond",
        isBase64: false,
        atlasPath: "assets/diamond.atlas",
        jsonPath: "assets/diamond.json",
        texturePath: "assets/diamond.tex1.png"
    }, {
        name: "Theseus",
        isBase64: false,
        atlasPath: "assets/theseus.atlas",
        jsonPath: "assets/theseus.json",
        texturePath: "assets/theseus.tex1.png"
    }];
    private animationList: SpineObject[] = [];

    private selectedSpineIndex: number = 0;
    private selectedAnimIndex: number = 0;
    private canMove: boolean = false;

    private webglContext: WebGLRenderingContext | WebGL2RenderingContext | null | undefined;
    private webglDrawCalls: number = 0;
    private realDrawElements: Function;
    private realWebGLClear: Function;

    private readonly maxDropSize = 3;
    private readonly moveSpeed = 500;

    constructor() {
        this.app = new PIXI.Application<HTMLCanvasElement>({ 
            background: '#1099bb', 
            width: 800,
            height: 600, 
        });
        document.body.appendChild(this.app.view);
        this.app?.stage?.addChild(this.objectContainer);

        this.initWebGLContext();
        this.initElements();
        this.initDropZone();
    }

    private initWebGLContext(): void {
        let gl = this.app?.view.getContext('webgl');
        if (!gl) {
             gl =  this.app?.view.getContext('webgl2');
        }
        if (gl) {
            // @ts-ignore
            this.realDrawElements = gl.__proto__.drawElements;
            // @ts-ignore
            this.realWebGLClear = gl.__proto__.clear;
            // @ts-ignore
            gl.__proto__.drawElements = this.fakeDrawElements.bind(this);
            // @ts-ignore
            gl.__proto__.clear = this.fakeWebGLClear.bind(this);
        }
        this.webglContext = gl;
    }

    private initElements(): void {
        this.addItemsToList('spine-list', this.spineList);

        this.addButton = document.getElementById('add') as HTMLButtonElement;
        this.addButton?.addEventListener('click', async () => {
            await this.addSpineObjects();
            this.moveButton.disabled = false;
        });

        this.moveButton = document.getElementById('move') as HTMLButtonElement;
        this.moveButton?.addEventListener('click', async () => {
            this.canMove = !this.canMove;
            this.moveButton.innerText = this.canMove ? 'Stop' : 'Move';
        });

        addEventListener('load', () => {
            void this.loadSpinePreviewAndAnimations();
        })

        this.app?.view.addEventListener('wheel', (event) => {
            const scale = 1 - (event.deltaY * 0.001);
            const screenCenterX = (this.app!.view.width * 0.5);
            const screenCenterY = (this.app!.view.height * 0.5);
            this.objectContainer.position.x = this.objectContainer.position.x + (screenCenterX - this.objectContainer.position.x) * (1 - scale);
            this.objectContainer.position.y = this.objectContainer.position.y + (screenCenterY - this.objectContainer.position.y) * (1 - scale);
            this.objectContainer.scale.x *= scale;
            this.objectContainer.scale.y *= scale;
        });

        
        this.app?.view.addEventListener('touchstart', (event) => {
            this.pinchCenter = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            this.pinchDistance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        });

        this.app?.view.addEventListener('touchmove', (event) => {
            const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
            const scale = distance / this.pinchDistance;
            const screenCenterX = (this.app!.view.width * 0.5);
            const screenCenterY = (this.app!.view.height * 0.5);
            this.objectContainer.position.x = this.pinchCenter.x + (screenCenterX - this.pinchCenter.x) * scale;
            this.objectContainer.position.y = this.pinchCenter.y + (screenCenterY - this.pinchCenter.y) * scale;
            this.objectContainer.scale.x *= scale;
            this.objectContainer.scale.y *= scale;
            this.pinchDistance = distance;
        });


        this.spineListMenu = document.getElementById('spine-list') as HTMLSelectElement;
        this.spineListMenu?.addEventListener('change', () => {
            this.reset();
            this.selectedAnimIndex = 0;
            this.selectedSpineIndex = this.spineListMenu.selectedIndex;
            void this.loadSpinePreviewAndAnimations();
        });

        this.animationListMenu = document.getElementById('animation-list') as HTMLSelectElement;
        this.animationListMenu?.addEventListener('change', () => {
            this.selectedAnimIndex = this.animationListMenu.selectedIndex;
            this.restartAnimations();
        });

    }

    private reset(): void {
        this.moveButton.disabled = true;
        this.resetSpineObjects();
        this.resetObjectContainer();
        this.disposeSpinePreview();

    }
    private resetSpineObjects(): void {
        this.spineObjects.forEach((spineObject) => {
            spineObject.destroy();
        });
        this.spineObjects.splice(0);
        this.updateCounter();
    }
    private resetObjectContainer(): void {
        this.objectContainer.position.x = 0;
        this.objectContainer.position.y = 0;
        this.objectContainer.scale.x = 1;
        this.objectContainer.scale.y = 1;
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

        // Add event listeners. To avoid flickering of the canvas, use 'dragover' on the body and 'dragleave' & 'drop' on the drop zone
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
                    isBase64: true,
                    atlasPath: '',
                    jsonPath: '',
                    texturePath: '',
                };
                // Loop through the files
                for (let i = 0; i < files.length; i++) {
                    await this.loadDroppedSpineFiles(files[i], spineObject);
                }
                
                this.spineList.push(spineObject);
                this.addItemsToList('spine-list', this.spineList);
                console.log('Spine object added:', spineObject);
            }
    }

    private loadDroppedSpineFiles(file: File, spineObject: SpineObject): Promise<void> {
        // Create resolvablePromise to wait for drop to finish loading
        const resolvePromise = new ResolvablePromise<void>();

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
        return resolvePromise.promise;
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
        const previewCount = this.spinePreview ? 1 : 0;
        count.innerText = `${this.spineObjects.length + previewCount} Spine Objects`;
    }

    private addSpineObjects(): Promise<void> {
        this.disposeSpinePreview();
        return this.loadSpineObject().then((data) => {
            for (let i = 0; i < SpineMachine.SPINE_ADD_COUNT; i++) {
                this.createSpineObject(data.spineData); // Create a new Spine animation
            }
            this.updateCounter();
        });
    }

    private loadSpinePreviewAndAnimations(): Promise<void> {
        return this.loadSpineObject().then((data) => {
            this.createSpineObject(data.spineData, true); // Create a new Spine animation
            this.updateCounter();
        });
    }

    private loadSpineObject(): Promise<any>  {
        return new Promise<any>(async (resolve, reject) => {
            const spineObject = this.spineList[this.selectedSpineIndex];
            if (spineObject.isBase64) {
                try {
                    const texture = PIXI.BaseTexture.from(spineObject.texturePath!);

                    // Decode base64 string to string
                    const atlasEncoded = spineObject.atlasPath?.split(",")[1] ?? '';
                    const atlasString = atob(atlasEncoded ?? '');
                    const spineAtlas = new pixiSpine.TextureAtlas(atlasString, (atlasName, textureLoader) => {
                        const atlasId = atlasName.split('.')[1];
                        textureLoader(texture);
                    });
                    const skeletonParser = new SkeletonJson(new AtlasAttachmentLoader(spineAtlas));

                    // Decode base64 string to string
                    const animationEncoded = spineObject.jsonPath?.split(",")[1] ?? '';
                    const animationString = atob(animationEncoded ?? '');
                    // Parse string as JSON data
                    const jsonData = JSON.parse(animationString);
                    resolve({ spineData: skeletonParser.readSkeletonData(jsonData) as pixiSpine.ISkeletonData });
                } catch (error) {
                    console.error('Error loading assets:', error);
                    reject(error);
                }
            } else {
                PIXI.Assets.load(spineObject.jsonPath!).then((data) => {
                    if (!data) {
                        console.error('Failed to load spine object.');
                        reject(data);
                        return;
                    }
                    resolve(data);
                }).catch((error) => {
                    console.error('Error loading assets:', error);
                    reject(error);
                });
            }
            
            
        })
    }

    private createSpineObject(spineData: SkeletonData, previewOnly = false): void {
        const spineAnimation = new Spine(spineData);

        if (previewOnly) {
            // Set the animation to play
            this.animationList.splice(0);
            spineAnimation.spineData.animations.forEach((animation) => {
                this.animationList.push({
                    name: animation.name,
                });
            });
            // Add the animation to the dropdown list
            this.addItemsToList('animation-list', spineAnimation.spineData.animations);
        
            // Set spine preview to center of the screen
            const scale = 0.5;
            spineAnimation.x = (this.app!.view.width * 0.5);
            spineAnimation.y = (this.app!.view.height * 0.5);
            spineAnimation.scale.set(scale);
            this.spinePreview = spineAnimation;

            // Start animation
            this.startSpineAnimation(spineAnimation)
        } else {
            // Randomly position the spine animation within the given range
            spineAnimation.x = 50 + Math.random() * 700; // Random x between 0 and 700
            spineAnimation.y = 25 + Math.random() * 500; // Random y between 0 and 500
            spineAnimation.scale.set(0.2);


            // Start animation
            this.startSpineAnimation(spineAnimation)
            this.spineObjects.push(spineAnimation);
        }

        // Add the spine character to the stage
        this.objectContainer.addChild(spineAnimation);
    }

    private startSpineAnimation(spine: Spine): void {
        if (this.animationList.length > 0) {
            spine.state.setAnimation(0, this.animationList[this.selectedAnimIndex].name, true);
        }
    }

    private restartAnimations(): void {
        this.spineObjects.forEach((spineObject) => {
            spineObject.state.setAnimation(0, this.animationList[this.selectedAnimIndex].name, true);
        });
    }

    private disposeSpinePreview(): void {
        this.spinePreview?.destroy();
        this.spinePreview = undefined;
    }

    private createLogo(): void {
        const logo = new PIXI.Sprite(PIXI.Texture.from('https://i.imgur.com/UjL9rZJ.png'));
        logo.scale.set(0.5);
        logo.anchor.set(0.5);
        logo.x = 400;
        logo.y = 550;
        this.app?.stage.addChild(logo);
      }

    private lastTime = Date.now();
    public update(): void {
        const updater = (): void => {
            const currentTime = Date.now();            
            const deltaTime = currentTime - this.lastTime;  
            this.lastTime = currentTime;
            this.tickEventHandler.updateEvents(deltaTime * 0.001);
            requestAnimationFrame(updater);
            this.moveSpineObjects(deltaTime * 0.001);
        };
        updater();
    }

    public moveSpineObjects(deltaTime: number): void {
        if (this.canMove) {
            const appHeight = this.app!.renderer.height;
            for (let i = 0; i < this.spineObjects.length; i++) {
                const spineObject = this.spineObjects[i];
                spineObject.y += this.moveSpeed * deltaTime;
                if (spineObject.y > appHeight) {
                    spineObject.y = 0;
                }
            }
        }
    }

    private updateDrawCalls(count: number): void {
        const drawCalls: HTMLElement = document.getElementById('draw-calls')!;
        drawCalls.innerText = `${count} Draw Calls`;
    }
    private fakeDrawElements(mode: number, count: number, type: number, offset: number): void {
        this.webglDrawCalls++;
        this.realDrawElements.call(this.webglContext, mode, count, type, offset);
    }
    private fakeWebGLClear(bitmask: number): void {
        if (bitmask == 16640) {
            this.updateDrawCalls(this.webglDrawCalls);
            this.webglDrawCalls = 0;
        }

        this.realWebGLClear.call(this.webglContext, bitmask);
    }
}
