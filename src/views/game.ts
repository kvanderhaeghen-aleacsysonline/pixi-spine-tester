import _ from 'lodash';
import * as Pixi from 'pixi.js';
import { createTickEventHandler, ITickEventHandler, ResolvablePromise } from "@gp/utils";
import * as PixiSpine from '@esotericsoftware/spine-pixi-v8';
import { SpineObject } from '../models/spineObject';
import { DatabaseService } from '../utils/database/database';
import { v4 as uuidv4 } from 'uuid';

export class SpineMachine {
    private app?: Pixi.Application;
    private tickEventHandler: ITickEventHandler = createTickEventHandler();

    private objectContainer: Pixi.Container = new Pixi.Container();
    private pinchCenter: { x: number, y: number } = { x: 0, y: 0 };
    private pinchDistance: number = 0;

    private addButton: HTMLButtonElement;
    private moveButton: HTMLButtonElement;
    private spineListMenu: HTMLSelectElement;
    private animationListMenu: HTMLSelectElement;
    private skinListMenu: HTMLSelectElement;
    private removeButton: HTMLButtonElement;
    private removeAllButton: HTMLButtonElement;

    private static SPINE_ADD_COUNT = 100;
    private spinePreview?: PixiSpine.Spine;
    private spineObjects: PixiSpine.Spine[] = [];
    private spineList: SpineObject[] = [{
        name: "Diamond",
        id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
        isBase64: false,
        atlasPath: "assets/diamond.atlas",
        jsonPath: "assets/diamond.json",
        texturePath: "assets/diamond.tex1.png"
    }, {
        name: "Theseus",
        id: "4a1d5e7f-3256-481d-8f3d-9b1c2d3e4f5g",
        isBase64: false,
        atlasPath: "assets/theseus.atlas",
        jsonPath: "assets/theseus.json",
        texturePath: "assets/theseus.tex1.png"
    }, {
        name: "Wild",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        isBase64: false,
        atlasPath: "assets/wild.atlas.txt",
        skeletonPath: "assets/wild.skel",
        texturePath: "assets/wild.tex.png"
    }];
    private animationList: { name: string }[] = [];
    private skinList: { name: string }[] = [];

    private selectedSpineIndex: number = 0;
    private selectedAnimIndex: number = 0;
    private selectedSkinIndex: number = 0;
    private canMove: boolean = false;

    private webglContext: WebGLRenderingContext | WebGL2RenderingContext | null | undefined;
    private webglDrawCalls: number = 0;
    private realDrawElements: Function;
    private realWebGLClear: Function;

    private readonly dataStorage = new DatabaseService();
    private readonly maxDropSize = 3;
    private readonly moveSpeed = 500;

    constructor () {
        this.app = new Pixi.Application();
    }

    public async init(): Promise<void> {
        const params = new URLSearchParams(window.location.search);
        const prefParam = (params.get("renderer") as "webgl" | "webgpu") ?? "webgl";
        
        await this.app?.init({
            background: "#1099bb",
            powerPreference: "high-performance",
            width: 800,
            height: 600,
            preference: prefParam,
            resolution: 1,
            antialias: false,
            hello: true,
            clearBeforeRender: true,
        });
        document.body.appendChild(this.app!.canvas);
        this.app?.stage?.addChild(this.objectContainer);

        this.initWebGLContext();
        this.initDropZoneEvents();
        this.initElementsAndEvents();
        this.addMouseEvents();
        this.addTouchEvents();

        this.createLogo();
        this.dataStorage.init();
        this.getItemsFromDatabase().then(() => {
            this.initRemoveButtons();
        });
    }

    private initWebGLContext(): void {
        let gl = this.app?.canvas.getContext('webgl');
        if (!gl) {
             gl =  this.app?.canvas.getContext('webgl2');
        }
            // @ts-ignore
        console.error(gl.__proto__.drawElements);
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

    private initElementsAndEvents(): void {
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

        this.spineListMenu = document.getElementById('spine-list') as HTMLSelectElement;
        this.spineListMenu?.addEventListener('change', () => {
            this.reset();
            this.selectedSpineIndex = this.spineListMenu.selectedIndex;
            void this.loadSpinePreviewAndAnimations();
            if(this.spineList[this.spineListMenu.selectedIndex].isBase64) {
                this.removeButton.disabled = false;
            } else {
                this.removeButton.disabled = true;
            }
        });

        this.animationListMenu = document.getElementById('animation-list') as HTMLSelectElement;
        this.animationListMenu?.addEventListener('change', () => {
            this.selectedAnimIndex = this.animationListMenu.selectedIndex;
            this.restartAnimations();
        }); 

        this.skinListMenu = document.getElementById('skin-list') as HTMLSelectElement;
        this.skinListMenu?.addEventListener('change', () => {
            this.selectedSkinIndex = this.skinListMenu.selectedIndex;
            this.restartAnimations();
            this.setSkin();
        }); 
    }

    private addMouseEvents(): void {
        this.app?.canvas.addEventListener('wheel', (event) => {
            const scale = 1 - (event.deltaY * 0.001);
            const screenCenterX = (this.app!.canvas.width * 0.5);
            const screenCenterY = (this.app!.canvas.height * 0.5);
            this.objectContainer.position.x = this.objectContainer.position.x + (screenCenterX - this.objectContainer.position.x) * (1 - scale);
            this.objectContainer.position.y = this.objectContainer.position.y + (screenCenterY - this.objectContainer.position.y) * (1 - scale);
            this.objectContainer.scale.x *= scale;
            this.objectContainer.scale.y *= scale;
        });

        let dragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        this.app?.canvas.addEventListener('mousedown', (event) => {
            dragging = true;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
        });
        this.app?.canvas.addEventListener('mousemove', (event) => {
            if(dragging) {
                const deltaX = event.clientX - dragStartX;
                const deltaY = event.clientY - dragStartY;
                this.objectContainer.position.x += deltaX;
                this.objectContainer.position.y += deltaY;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
            }
        });
        this.app?.canvas.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    private addTouchEvents(): void {
        let oneFinger = false;
        let pinchDistance = 0;
        let pinchCenter = { x: 0, y: 0 };
        this.app?.canvas.addEventListener('touchstart', (event) => {
            if(event.touches.length === 1) {
                oneFinger = true;
                pinchCenter = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            } else {
                oneFinger = false;
                pinchDistance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
                pinchCenter = { x: (event.touches[0].clientX + event.touches[1].clientX) / 2, y: (event.touches[0].clientY + event.touches[1].clientY) / 2 };
            }
        });

        this.app?.canvas.addEventListener('touchmove', (event) => {
            if(oneFinger) {
                this.objectContainer.position.x += event.touches[0].clientX - pinchCenter.x;
                this.objectContainer.position.y += event.touches[0].clientY - pinchCenter.y;
                pinchCenter = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            } else {
                const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
                const scale = distance / pinchDistance;
                const screenCenterX = (this.app!.canvas.width * 0.5);
                const screenCenterY = (this.app!.canvas.height * 0.5);
                this.objectContainer.position.x = pinchCenter.x + (screenCenterX - pinchCenter.x) * scale;
                this.objectContainer.position.y = pinchCenter.y + (screenCenterY - pinchCenter.y) * scale;
                this.objectContainer.scale.x *= scale;
                this.objectContainer.scale.y *= scale;
                pinchDistance = distance;
            }
        });
    }

    private initRemoveButtons(): void {
        this.removeButton = document.getElementById('remove') as HTMLButtonElement;
        this.removeButton?.addEventListener('click', async () => {
            await this.dataStorage.removeItem(this.spineList[this.selectedSpineIndex].id);
            location.reload();
            
        });
        this.removeAllButton = document.getElementById('remove-all') as HTMLButtonElement;
        this.removeAllButton?.addEventListener('click', async () => {
            await this.dataStorage.removeAll();
            location.reload();
        });
    }
    
    private reset(): void {
        this.moveButton.disabled = true;
        this.resetSpineObjects();
        this.resetObjectContainer();
        this.disposeSpinePreview();

        this.selectedAnimIndex = 0;
        this.animationListMenu.selectedIndex = 0;
        this.selectedSkinIndex = 0;
        this.skinListMenu.selectedIndex = 0;
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

    private addItemsToList(elementId: string, items: any[]): void {
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

    private initDropZoneEvents(): void {
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
                    id: uuidv4(),
                    name: '',
                    isBase64: true,
                    atlasPath: '',
                    jsonPath: undefined,
                    skeletonPath: undefined,
                    texturePath: '',
                };
                // Loop through the files
                for (let i = 0; i < files.length; i++) {
                    await this.loadDroppedSpineFiles(files[i], spineObject);
                }
                
                this.spineList.push(spineObject);
                this.addItemsToList('spine-list', this.spineList);
                void this.dataStorage.addItem(spineObject.id, {
                    name: spineObject.name,
                    atlas: spineObject.atlasPath ?? '',
                    animation: spineObject.jsonPath,
                    skeleton: spineObject.skeletonPath,
                    image: spineObject.texturePath ?? '',
                });
                console.log('Spine object added:', spineObject);
            }
    }

    private loadDroppedSpineFiles(file: File, spineObject: SpineObject): Promise<void> {
        // Create resolvablePromise to wait for drop to finish loading
        const resolvePromise = new ResolvablePromise<void>();

        // Check the file type
        if (this.isCorrectFileTyp(file)) {
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
                } else if (file.name.endsWith('.skel')) {
                    spineObject.skeletonPath = fileContents as string;
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

    private isCorrectFileTyp(file: File): boolean {
        return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.endsWith('.atlas') || file.name.endsWith('.atlas.txt') || file.name.endsWith('.json') || file.name.endsWith('.skel');
    }

    private dragHandler(hasEntered: boolean): void {
        // Get the drop zone
        const dropZone = document.getElementById('drop-zone');
        dropZone!.style.pointerEvents = hasEntered ? "auto" : "none";

        // Show/Hide the image preview items are dropped
        const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
        imagePreview.style.display = hasEntered ?  'block' : 'none';

        // Show/Hide buttons
        this.removeButton.style.display = hasEntered ? 'none' : 'inline-block';
        this.removeAllButton.style.display = hasEntered ? 'none' : 'inline-block';

        // Show/Hide pixi app
        if (this.app) {
            this.app.view.style.display = hasEntered ?  'none' : 'inline';
        }
    }

    private getItemsFromDatabase(): Promise<void> {
        return this.dataStorage.getItems().then((dataArray) => {
            const length = dataArray.length;
            for (let i = 0; i < length; i++) {
                this.spineList.push(dataArray[i]);
            }
            this.addItemsToList('spine-list', this.spineList);
        });
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
                    // Decode base64 string to string
                    const atlasEncoded = spineObject.atlasPath?.split(",")[1] ?? '';
                    const atlasString = atob(atlasEncoded ?? '');
                    const textureAtlas: PixiSpine.TextureAtlas = new PixiSpine.TextureAtlas(
                        atlasString,
                    );
                    let skeletonParser: PixiSpine.SkeletonJson | PixiSpine.SkeletonBinary;

                    // Decode base64 string to string
                    let spineData: PixiSpine.SkeletonData;
                    if (spineObject.skeletonPath) {
                        const skeletonEncoded = spineObject.skeletonPath?.split(",")[1] ?? '';
                        const skeletonBinary = atob(skeletonEncoded);
                        const skeletonData = new Uint8Array(skeletonBinary.length);
                        for (let i = 0; i < skeletonBinary.length; i++) {
                            skeletonData[i] = skeletonBinary.charCodeAt(i);
                        }

                        skeletonParser = new PixiSpine.SkeletonBinary(
                            new PixiSpine.AtlasAttachmentLoader(textureAtlas),
                        );
                        spineData = skeletonParser.readSkeletonData(skeletonData);
                    } else {
                        const animationEncoded = spineObject.jsonPath?.split(",")[1] ?? '';
                        const animationString = atob(animationEncoded ?? '');
                        const jsonData = JSON.parse(animationString);

                        skeletonParser = new PixiSpine.SkeletonJson(
                            new PixiSpine.AtlasAttachmentLoader(textureAtlas),
                        );
                        spineData = skeletonParser.readSkeletonData(jsonData);
                    }
              
                    if (textureAtlas) {
                        const texture = await Pixi.Assets.load<Pixi.Texture>(spineObject.texturePath!);
                        for (const page of textureAtlas?.pages ?? []) {
                            page.setTexture(PixiSpine.SpineTexture.from(texture.source));
                        }
                    }
                    resolve({ spineData: spineData });
                } catch (error) {
                    console.error('Error loading assets:', error);
                    reject(error);
                }
            } else {
                try {
                    const atlas =
                        (await (
                        await fetch(spineObject.atlasPath!)
                        ).text()) ?? "";
                    const animation = spineObject.skeletonPath ?
                        new Uint8Array((await (
                            await fetch(spineObject.skeletonPath!)
                            ).arrayBuffer()))
                        ?? "" : 
                        (await (
                        await fetch(spineObject.jsonPath!)
                        ).json()) ?? "";

                    const textureAtlas: PixiSpine.TextureAtlas = new PixiSpine.TextureAtlas(
                        atlas,
                    );
                    const skeletonParser = spineObject.skeletonPath ? new PixiSpine.SkeletonBinary(
                        new PixiSpine.AtlasAttachmentLoader(textureAtlas),
                    ) : new PixiSpine.SkeletonJson(
                        new PixiSpine.AtlasAttachmentLoader(textureAtlas),
                    );
                    const spineData = skeletonParser.readSkeletonData(animation);

                    if (textureAtlas) {
                        const texture = await Pixi.Assets.load<Pixi.Texture>(spineObject.texturePath!);
                        for (const page of textureAtlas?.pages ?? []) {
                            page.setTexture(PixiSpine.SpineTexture.from(texture.source));
                        }
                    }
                    resolve({ spineData: spineData });
                } catch(error) {
                    console.error('Error loading assets:', error);
                    reject(error);
                };
            }
        });
    }

    private createSpineObject(spineData: PixiSpine.SkeletonData, previewOnly = false): void {
        const spineAnimation = new PixiSpine.Spine(spineData);

        if (previewOnly) {
            // Set the animation to play
            this.animationList.splice(0);
            spineData.animations.forEach((animation) => {
                this.animationList.push({
                    name: animation.name,
                });
            });
            // Add the animation to the dropdown list
            this.addItemsToList('animation-list', spineData.animations);

            // Set the skin
            this.skinList.splice(0);
            spineData.skins.forEach((skin) => {
                this.skinList.push({
                    name: skin.name,
                });
            });
            // Add the skin to the dropdown list
            this.addItemsToList('skin-list', spineData.skins);
        
            // Set spine preview to center of the screen
            const scale = 0.5;
            spineAnimation.x = (this.app!.canvas.width * 0.5);
            spineAnimation.y = (this.app!.canvas.height * 0.5);
            spineAnimation.scale.set(scale);
            this.spinePreview = spineAnimation;
        } else {
            // Randomly position the spine animation within the given range
            spineAnimation.x = 50 + Math.random() * 700; // Random x between 0 and 700
            spineAnimation.y = 25 + Math.random() * 500; // Random y between 0 and 500
            spineAnimation.scale.set(0.2);
            this.spineObjects.push(spineAnimation);
        }

        // Start animation
        this.startSpineAnimation(spineAnimation)
        this.startSpineSkin(spineAnimation);

        // Add the spine character to the stage
        this.objectContainer.addChild(spineAnimation);
    }

    private startSpineAnimation(spine: PixiSpine.Spine): void {
        if (this.animationList.length > 0) {
            spine.state.setAnimation(0, this.animationList[this.selectedAnimIndex].name, true);
        }
    }
    private startSpineSkin(spine: PixiSpine.Spine): void {
        if (this.skinList.length > 1) {
            this.selectedSkinIndex = 1;
            this.skinListMenu.selectedIndex = this.selectedSkinIndex;
        }
        if (this.skinList.length > 0) {
            spine.skeleton.setSkinByName(this.skinList[this.selectedSkinIndex].name);
        }
    }


    private restartAnimations(): void {
        const animName = this.animationList[this.selectedAnimIndex].name;
        this.spineObjects?.forEach((spineObject) => {
            spineObject.state.setAnimation(0, animName, true);
        });
        this.spinePreview?.state.setAnimation(0, animName, true);
    }
    private setSkin(): void {
        const skinName = this.skinList[this.selectedSkinIndex].name;
        this.spineObjects?.forEach((spineObject) => {
            spineObject.skeleton.setSkinByName(skinName);
        });
        this.spinePreview?.skeleton.setSkinByName(skinName);
    }

    private disposeSpinePreview(): void {
        this.spinePreview?.destroy();
        this.spinePreview = undefined;
    }

    private createLogo(): void {
        const logo = new Pixi.Sprite(Pixi.Texture.from('https://i.imgur.com/UjL9rZJ.png'));
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
        if (bitmask == 17664) {
            this.updateDrawCalls(this.webglDrawCalls);
            this.webglDrawCalls = 0;
        }
        this.realWebGLClear.call(this.webglContext, bitmask);
    }
}
